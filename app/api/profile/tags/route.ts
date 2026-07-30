import { NextResponse } from "next/server";
import { addTagsSchema } from "@/lib/schemas";
import { addUserInterestTags } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Additively tune a signed-in student's saved interests (BUILD_PROMPT §6) — called when
 * SearchBar discovers tags the student hasn't explicitly saved. Only ever adds; never removes or
 * touches grade/age/region/personality (see lib/profile.ts addUserInterestTags).
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
  const parsed = addTagsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed.", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await addUserInterestTags(user.id, parsed.data.tagSlugs);
    return NextResponse.json({ ok: true, addedTags: parsed.data.tagSlugs.length });
  } catch (err) {
    console.error("profile tag-tune error:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't update your interests." }, { status: 500 });
  }
}
