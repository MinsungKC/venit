import { NextResponse } from "next/server";
import { profileSchema } from "@/lib/schemas";
import { saveProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save the signed-in student's profile (BUILD_PROMPT §3). Accepts the SECRET personality vector to
 * write it to the guarded column — the response NEVER contains any personality data (§0.1).
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to save your profile." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed.", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await saveProfile(user.id, parsed.data);
    // Return only non-secret confirmation — never the personality vector/archetypes.
    return NextResponse.json({ ok: true, savedTags: parsed.data.tagSlugs.length });
  } catch (err) {
    console.error("profile save error:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't save your profile." }, { status: 500 });
  }
}
