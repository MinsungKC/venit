import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminKeyOk, isAdmin, isAdminRequestAuthorized, searchListings } from "@/lib/admin";
import { getPool } from "@/lib/db";
import { getUser } from "@/lib/supabase/server";
import { slugify } from "@/lib/mapping";
import { LISTING_KINDS, COST_TYPES } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERATED_LISTINGS = join(process.cwd(), "public", "data", "listings.generated.json");
const GENERATED_TAGS = join(process.cwd(), "public", "data", "tags.generated.json");

/**
 * Admin CRUD over ANY listing (BUILD_PROMPT §4: admins can edit / remove / add). Complements the
 * approve/reject moderation route. Auth is the shared ADMIN_KEY OR a signed-in admin role.
 * Nothing here touches personality data (§0.1).
 */
const patchSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  short_description: z.string().trim().max(300).optional(),
  url: z.string().url().max(500).nullable().optional().or(z.literal("")),
  apply_url: z.string().url().max(500).nullable().optional().or(z.literal("")),
  location_name: z.string().trim().max(160).nullable().optional().or(z.literal("")),
  is_remote: z.boolean().optional(),
  cost_type: z.enum(COST_TYPES).optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), key: z.string().optional(), id: z.number().int().positive() }),
  z.object({ action: z.literal("update"), key: z.string().optional(), id: z.number().int().positive(), patch: patchSchema }),
  z.object({
    action: z.literal("create"),
    key: z.string().optional(),
    listing: z.object({
      title: z.string().trim().min(2).max(160),
      kind: z.enum(LISTING_KINDS),
      short_description: z.string().trim().min(1).max(300),
      url: z.string().trim().max(500).optional().or(z.literal("")),
      apply_url: z.string().trim().max(500).optional().or(z.literal("")),
      location_name: z.string().trim().max(160).optional().or(z.literal("")),
      is_remote: z.boolean().default(false),
      cost_type: z.enum(COST_TYPES).default("unknown"),
    }),
    tag_slugs: z.array(z.string().min(1)).min(1).max(12),
  }),
]);

/** GET ?q= → search listings to manage (admin only). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const user = await getUser();
  const authorized = isAdminRequestAuthorized(searchParams.get("key"), user?.id) || (await isAdmin(user?.id));
  if (!authorized) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ results: await searchListings(searchParams.get("q") ?? "") });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad request.", issues: parsed.error.flatten(), message: parsed.error.issues[0]?.message ?? "Validation failed." },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const authorized = isAdminRequestAuthorized(data.key, (await getUser())?.id) || (await isAdmin((await getUser())?.id));
  if (!authorized) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const pool = getPool();

  try {
    if (data.action === "delete") {
      if (!pool) return NextResponse.json({ ok: true, deleted: 0, note: "No database configured." });
      const r = await pool.query(`delete from listings where id = $1`, [data.id]);
      return NextResponse.json({ ok: true, deleted: r.rowCount });
    }

    if (data.action === "update") {
      // Build a dynamic SET from the provided fields only (empty-string URL/location -> null).
      const fields: string[] = [];
      const vals: unknown[] = [];
      const norm = (v: unknown) => (v === "" ? null : v);
      for (const [k, v] of Object.entries(data.patch)) {
        if (v === undefined) continue;
        vals.push(k === "cost_type" || k === "status" ? v : norm(v));
        fields.push(`${k} = $${vals.length}${k === "cost_type" ? "::cost_type" : k === "status" ? "::listing_status" : ""}`);
      }
      if (!pool) return NextResponse.json({ ok: true, updated: 0, note: "No database configured." });
      if (fields.length === 0) return NextResponse.json({ ok: true, updated: 0 });
      vals.push(data.id);
      const r = await pool.query(`update listings set ${fields.join(", ")} where id = $${vals.length}`, vals);
      return NextResponse.json({ ok: true, updated: r.rowCount });
    }

    // create: an admin-added, immediately-approved listing (source 'admin').
    const l = data.listing;
    const slug = `${slugify(l.title) || "listing"}-${Math.random().toString(36).slice(2, 7)}`;

    if (!pool) {
      const listings = JSON.parse(readFileSync(GENERATED_LISTINGS, "utf8")) as Array<Record<string, unknown>>;
      const tags = JSON.parse(readFileSync(GENERATED_TAGS, "utf8")) as Array<Record<string, unknown>>;
      const tagMap = new Map((tags as Array<{ slug: string; label: string }>).map((t) => [t.slug, t.label]));
      const entry = {
        external_id: randomUUID(),
        source: "admin",
        kind: l.kind,
        title: l.title,
        slug,
        url: l.url || null,
        apply_url: l.apply_url || null,
        short_description: l.short_description || null,
        long_description: null,
        location_name: l.location_name || null,
        lat: null,
        lng: null,
        is_remote: l.is_remote,
        team_size: null,
        industry: null,
        subindustry: null,
        cost_type: l.cost_type,
        cost_amount: null,
        age_min: null,
        age_max: null,
        grade_min: null,
        grade_max: null,
        program_start: null,
        program_end: null,
        application_open: null,
        application_deadline: null,
        is_recruiting: true,
        badges: ["admin"],
        status: "approved",
        tag_slugs: data.tag_slugs,
        niche_slugs: [],
      };
      const next = [entry, ...listings];
      writeFileSync(GENERATED_LISTINGS, JSON.stringify(next, null, 2));
      return NextResponse.json({ ok: true, id: next.length, slug, source: "fallback-json" });
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      const ins = await client.query<{ id: number }>(
        `insert into listings (external_id, source, kind, title, slug, url, apply_url,
           short_description, location_name, is_remote, cost_type, status)
         values ($1,'admin',$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved') returning id`,
        [randomUUID(), l.kind, l.title, slug, l.url || null, l.apply_url || null, l.short_description,
         l.location_name || null, l.is_remote, l.cost_type],
      );
      const listingId = ins.rows[0].id;
      const tagRows = await client.query<{ id: number }>(
        `select id from interest_tags where slug = any($1::text[])`,
        [data.tag_slugs],
      );
      if (tagRows.rows.length === 0) {
        await client.query("rollback");
        return NextResponse.json({ error: "None of the tag slugs were recognized." }, { status: 400 });
      }
      for (const t of tagRows.rows) {
        await client.query(`insert into listing_interest_tags (listing_id, tag_id) values ($1,$2) on conflict do nothing`, [listingId, t.id]);
      }
      await client.query("commit"); // deferred "approved needs >=1 tag" trigger validates here
      return NextResponse.json({ ok: true, id: listingId, slug, source: "database" });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
