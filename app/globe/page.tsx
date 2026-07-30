import Link from "next/link";
import { runMatch, toGlobePoints } from "@/lib/match-data";
import GlobeView from "./GlobeView";

export const dynamic = "force-dynamic";

function num(v: string | undefined, lo: number, hi: number): number | null {
  const n = Number(v);
  return v && Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}

/** Map/globe view of matched opportunities (BUILD_PROMPT §7). Set an address to filter by distance. */
export default function GlobePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const tags = (searchParams.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (!tags.length) {
    return (
      <main className="container">
        <h1>Map view</h1>
        <p className="lede">Pick your interests first and we&apos;ll plot the matches on a globe.</p>
        <Link className="button" href="/onboarding">
          Pick your interests →
        </Link>
      </main>
    );
  }

  const results = runMatch({
    tagSlugs: tags,
    grade: num(searchParams.grade, 1, 13),
    age: num(searchParams.age, 5, 100),
    nicheSlugs: (searchParams.niche ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  });
  const points = toGlobePoints(results);

  const carry = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && v) carry.set(k, v);

  return (
    <main className="container">
      <GlobeView points={points} totalMatches={results.length} backHref={`/match?${carry.toString()}`} />
    </main>
  );
}
