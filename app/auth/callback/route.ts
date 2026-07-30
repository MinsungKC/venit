import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Magic-link callback: exchange the code for a session and ensure the student has a profiles row. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // Ensure the profile row exists (id = auth.users.id). Idempotent.
      const pool = getPool();
      if (pool) {
        try {
          await pool.query(`insert into profiles (id) values ($1) on conflict (id) do nothing`, [data.user.id]);
        } catch {
          /* non-fatal — the profile can be created on first save */
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=1`);
}
