import Link from "next/link";
import { redirect } from "next/navigation";
import { runMatch } from "@/lib/match-data";
import type { ListingKind } from "@/lib/mapping";
import RateDeck from "./RateDeck";

export const dynamic = "force-dynamic";

const KIND_VALUES: ListingKind[] = ["company", "research_lab", "program", "opportunity", "camp", "volunteer"];

function num(v: string | undefined, lo: number, hi: number): number | null {
  const n = Number(v);
  return v && Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}

/** Post-onboarding "rate your top 5" step (BUILD_PROMPT §6) — curates before showing everything. */
export default function RefinePage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const tags = (searchParams.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!tags.length) redirect("/onboarding");

  const results = runMatch({
    tagSlugs: tags,
    grade: num(searchParams.grade, 1, 13),
    age: num(searchParams.age, 5, 100),
    nicheSlugs: (searchParams.niche ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    preferredKinds: (searchParams.kinds ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is ListingKind => KIND_VALUES.includes(s as ListingKind)),
  });

  // Carry the original query through to /match.
  const carry = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && v) carry.set(k, v);

  // The rating deck excludes OpenAlex individual-researcher entries (bare PI names) — it should
  // surface real opportunities (companies, programs, camps, curated labs) to rate.
  const eligible = results.filter((l) => !l.badges.includes("openalex"));
  const top = eligible.slice(0, 5).map((l) => ({
    slug: l.slug,
    title: l.title,
    kind: l.kind,
    tags: l.matchedTags.slice(0, 4),
    tagSlugs: l.tag_slugs,
    description: l.short_description,
    url: l.url,
    location: l.is_remote ? "Remote" : l.location_name ?? "—",
    cost: l.cost_type,
  }));

  if (top.length === 0) {
    redirect(`/match?${carry.toString()}`);
  }

  return (
    <main className="container">
      <Link href="/onboarding" className="back">
        ← Back
      </Link>
      <RateDeck opps={top} carry={carry.toString()} />
    </main>
  );
}
