import { NextResponse } from "next/server";
import { runMatch } from "@/lib/match-data";
import { getDesiredVectors, getUserPersonalityVector } from "@/lib/personality-data";
import { getUser } from "@/lib/supabase/server";
import type { ListingKind } from "@/lib/mapping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: ListingKind[] = ["company", "research_lab", "program", "opportunity", "camp", "volunteer"];

/**
 * Top-N matches for the onboarding finale (BUILD_PROMPT §6) — so the wizard can show a student's
 * best 5 opportunities inline instead of bouncing to a separate page. Runs the same server-side
 * matcher as /match (never ships the catalog to the client), including personality-fit ranking
 * from the just-saved secret vector. Only student-safe fields are returned (no personality, §0.1).
 */
export async function POST(req: Request) {
  let body: { tags?: string[]; niche?: string[]; kinds?: string[]; grade?: number | null; age?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const tags = (Array.isArray(body.tags) ? body.tags : []).map(String).slice(0, 60);
  if (tags.length === 0) return NextResponse.json({ results: [] });
  const niche = (Array.isArray(body.niche) ? body.niche : []).map(String).slice(0, 40);
  const kinds = (Array.isArray(body.kinds) ? body.kinds : []).filter((k): k is ListingKind =>
    KINDS.includes(k as ListingKind),
  );
  const grade = typeof body.grade === "number" ? body.grade : null;
  const age = typeof body.age === "number" ? body.age : null;

  // Personality-fit ranking from the student's stored secret vector (service-side only, §0.1).
  const user = await getUser();
  const personalityVector = user ? await getUserPersonalityVector(user.id) : null;
  const desiredBySlug = personalityVector ? await getDesiredVectors() : undefined;

  const all = runMatch({
    tagSlugs: tags,
    nicheSlugs: niche,
    grade,
    age,
    preferredKinds: kinds,
    personalityVector,
    desiredBySlug,
  });

  // Exclude bare OpenAlex researcher entries (like /refine) — surface real, tangible opportunities.
  const results = all
    .filter((l) => !l.badges.includes("openalex"))
    .slice(0, 5)
    .map((l) => ({
      slug: l.slug,
      title: l.title,
      kind: l.kind,
      matchedTags: l.matchedTags.slice(0, 4),
      tagSlugs: l.tag_slugs, // used by the rating deck to boost highly-rated matches (§6)
      short_description: l.short_description,
      location: l.is_remote ? "Remote" : l.location_name,
      cost_type: l.cost_type,
      url: l.url,
      fitLabel: l.fitLabel,
    }));

  return NextResponse.json({ results });
}
