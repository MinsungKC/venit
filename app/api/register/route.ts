import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { registrationSchema } from "@/lib/schemas";
import { getPool } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { slugify } from "@/lib/mapping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Org self-registration (BUILD_PROMPT §4). Validates with Zod, rate-limits per IP, and inserts a
 * `status = 'pending'` listing (+ optional org + desired-personality links) into the moderation
 * queue — never live until an admin approves. Personality is never accepted from students here;
 * `desired_archetypes` is an org's own preference and is used only for ranking (§0.1).
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  const pool = getPool();
  if (!pool) {
    return NextResponse.json({ error: "Registration is unavailable (no database configured)." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed.", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("begin");

    let orgId: number | null = null;
    if (d.org_name) {
      const o = await client.query<{ id: number }>(
        `insert into orgs (name, website, verification) values ($1,$2,'pending') returning id`,
        [d.org_name, d.url || null],
      );
      orgId = o.rows[0].id;
    }

    const slug = `${slugify(d.title) || "listing"}-${Math.random().toString(36).slice(2, 7)}`;
    const ins = await client.query<{ id: number }>(
      `insert into listings (
         external_id, source, kind, title, slug, url, apply_url, linkedin_url,
         short_description, location_name, is_remote, cost_type, grade_min, grade_max, status, org_id
       ) values ($1,'self_registered',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14)
       returning id`,
      [
        randomUUID(), d.kind, d.title, slug, d.url || null, d.apply_url || null, d.linkedin_url || null,
        d.short_description, d.location_name || null, d.is_remote, d.cost_type,
        d.grade_min ?? null, d.grade_max ?? null, orgId,
      ],
    );
    const listingId = ins.rows[0].id;

    const tags = await client.query<{ id: number }>(
      `select id from interest_tags where slug = any($1::text[])`,
      [d.tag_slugs],
    );
    if (tags.rows.length === 0) {
      await client.query("rollback");
      return NextResponse.json({ error: "None of the chosen interest tags were recognized." }, { status: 400 });
    }
    for (const t of tags.rows) {
      await client.query(
        `insert into listing_interest_tags (listing_id, tag_id) values ($1,$2) on conflict do nothing`,
        [listingId, t.id],
      );
    }

    if (d.desired_archetypes?.length) {
      const arch = await client.query<{ id: number }>(
        `select id from personality_archetypes where slug = any($1::text[])`,
        [d.desired_archetypes],
      );
      for (const a of arch.rows) {
        await client.query(
          `insert into listing_desired_personality (listing_id, archetype_id) values ($1,$2) on conflict do nothing`,
          [listingId, a.id],
        );
      }
    }

    await client.query("commit");
    return NextResponse.json({ ok: true, status: "pending", slug });
  } catch (err) {
    await client.query("rollback");
    console.error("register error:", (err as Error).message);
    return NextResponse.json({ error: "Something went wrong saving your submission." }, { status: 500 });
  } finally {
    client.release();
  }
}
