import { NextResponse } from "next/server";
import { clearProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reset the signed-in student's saved form (Settings → "Reset form"). Clears interests +
 * grade/age/region + the secret personality vector so onboarding starts fresh. Auth-gated; the
 * response carries no profile data.
 */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    await clearProfile(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("profile reset error:", (err as Error).message);
    return NextResponse.json({ error: "Couldn't reset your form." }, { status: 500 });
  }
}
