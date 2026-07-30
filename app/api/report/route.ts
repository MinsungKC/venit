import { NextResponse } from "next/server";
import { reportSchema } from "@/lib/schemas";
import { getPool } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Report a broken link / problem with a listing (BUILD_PROMPT §7). Rate-limited, Zod-validated. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`report:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many reports. Try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const d = parsed.data;

  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "Reporting unavailable." }, { status: 503 });

  try {
    const found = await pool.query<{ id: number }>(`select id from listings where slug = $1`, [d.slug]);
    await pool.query(
      `insert into reports (listing_id, slug, reason, detail) values ($1,$2,$3,$4)`,
      [found.rows[0]?.id ?? null, d.slug, d.reason, d.detail || null],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
