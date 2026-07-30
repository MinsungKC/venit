import { NextResponse } from "next/server";
import { z } from "zod";
import { adminKeyOk } from "@/lib/admin";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  key: z.string().min(1),
  id: z.number().int().positive(),
  action: z.enum(["approve", "reject"]),
});

/** Approve / reject a pending listing (BUILD_PROMPT §4 admin). Gated by the shared ADMIN_KEY. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { key, id, action } = parsed.data;

  if (!adminKeyOk(key)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "No database configured." }, { status: 503 });

  const status = action === "approve" ? "approved" : "rejected";
  try {
    // The deferred "approved needs >=1 tag" trigger validates this at commit.
    const r = await pool.query(`update listings set status = $1 where id = $2 and status = 'pending'`, [status, id]);
    return NextResponse.json({ ok: true, updated: r.rowCount, status });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
