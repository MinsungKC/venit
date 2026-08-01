import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getPool } from "@/lib/db";
import { trackerSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Account-synced application tracker (BUILD_PROMPT §7 ★). The tracker/shortlist are local-first
 * (lib/stars.ts) so they work with no account; for a SIGNED-IN student this endpoint mirrors the
 * data to the `stars` + `applications` tables so it follows them across devices.
 *
 * Writes go through the pg pool with an explicit `user_id` from the session (same pattern as
 * /api/profile) — scoped to the authed user, never trusting a client-supplied id. Only public
 * listing fields are ever returned; nothing personality-related is involved (§0.1).
 */

/** GET → the signed-in student's saved listings (public snapshot + tracker status/notes). */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ items: [] }, { status: 401 });
  const pool = getPool();
  if (!pool) return NextResponse.json({ items: [] });

  const r = await pool.query<{
    slug: string;
    title: string;
    kind: string;
    url: string | null;
    cost_type: string;
    location_name: string | null;
    is_remote: boolean;
    status: string | null;
    notes: string | null;
    created_at: string;
  }>(
    `select l.slug, l.title, l.kind::text as kind, l.url, l.cost_type::text as cost_type,
            l.location_name, l.is_remote,
            a.status::text as status, a.notes, s.created_at
       from stars s
       join listings l on l.id = s.listing_id
       left join applications a on a.user_id = s.user_id and a.listing_id = s.listing_id
      where s.user_id = $1
      order by s.created_at desc`,
    [user.id],
  );

  const items = r.rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    url: row.url,
    cost_type: row.cost_type,
    location_name: row.location_name,
    is_remote: row.is_remote,
    status: row.status ?? "interested",
    notes: row.notes ?? "",
    starredAt: new Date(row.created_at).getTime(),
  }));
  return NextResponse.json({ items });
}

/** POST → apply one tracker mutation (star / unstar / status / notes) for the signed-in student. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "No database." }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = trackerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed." }, { status: 400 });
  const { op, slug, status, notes } = parsed.data;

  // Resolve the slug to a listing id (a listing must exist to be tracked).
  const lid = (await pool.query<{ id: string }>(`select id from listings where slug = $1`, [slug])).rows[0]?.id;
  if (!lid) return NextResponse.json({ error: "Unknown listing." }, { status: 404 });

  switch (op) {
    case "star":
      await pool.query(
        `insert into stars (user_id, listing_id) values ($1,$2) on conflict do nothing`,
        [user.id, lid],
      );
      await pool.query(
        `insert into applications (user_id, listing_id, status) values ($1,$2,'interested')
         on conflict (user_id, listing_id) do nothing`,
        [user.id, lid],
      );
      // No write-time profile mutation: adaptation is derived at read time from `stars` (with
      // decay) in lib/adaptive.ts, so saves stay cheap and the model forgets as engagement ages.
      break;
    case "unstar":
      await pool.query(`delete from stars where user_id = $1 and listing_id = $2`, [user.id, lid]);
      await pool.query(`delete from applications where user_id = $1 and listing_id = $2`, [user.id, lid]);
      break;
    case "status":
      if (!status) return NextResponse.json({ error: "status required." }, { status: 400 });
      await pool.query(
        `insert into applications (user_id, listing_id, status) values ($1,$2,$3::application_status)
         on conflict (user_id, listing_id) do update set status = excluded.status, updated_at = now()`,
        [user.id, lid, status],
      );
      break;
    case "notes":
      await pool.query(
        `insert into applications (user_id, listing_id, notes) values ($1,$2,$3)
         on conflict (user_id, listing_id) do update set notes = excluded.notes, updated_at = now()`,
        [user.id, lid, notes ?? ""],
      );
      break;
  }

  return NextResponse.json({ ok: true });
}
