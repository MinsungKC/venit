/**
 * Build the static dataset the /listings + /match pages read.
 *   npm run data:build  ->  public/data/listings.generated.json + tags.generated.json + niche-tags.json
 *
 * Also retains each listing's SPECIFIC source tags (yc keywords, OpenAlex subfields…) as
 * `niche_slugs`, so a student's free-text niche interest ("fire monitoring") can match companies
 * carrying a close niche tag — even when it doesn't map to one of the ~109 canonical tags.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAllListings } from "../lib/sources";
import { buildDataset, labelsToSlugPairs, slugify } from "../lib/mapping";
import { applyClassification, applyTaxonomyDomains } from "../lib/classification";

const outDir = join(process.cwd(), "public", "data");
const CURATED_NICHE = join(process.cwd(), "supabase", "seed", "niche-tags-curated.json");

function main() {
  const raw = loadAllListings();

  // Original source tags per listing (before canonicalization), for niche matching.
  const rawTags = new Map<string, { slug: string; label: string }[]>();
  for (const l of raw) rawTags.set(`${l.source}:${l.external_id}`, labelsToSlugPairs(l.tag_labels));

  const built = buildDataset(applyClassification(raw));
  const listings = built.listings;
  const tags = applyTaxonomyDomains(built.tags);

  // Curated niche tags (supabase/seed/niche-tags-curated.json): a large hand-authored vocabulary of
  // specific subtopics, keyword-attached to any listing whose text mentions them, so a student's
  // free-text niche interest ("astrophotography", "immunotherapy") has far more to match against.
  // Skip any whose slug collides with a canonical tag (those aren't "niche").
  const canonicalSlugs = new Set(tags.map((t) => t.slug));
  const curatedNiche = (
    JSON.parse(readFileSync(CURATED_NICHE, "utf8")) as { label: string; keywords: string[] }[]
  )
    .map((c) => ({ slug: slugify(c.label), label: c.label, keywords: c.keywords.map((k) => k.toLowerCase()) }))
    .filter((c) => c.slug && !canonicalSlugs.has(c.slug));

  // Attach niche slugs (source tags that aren't already a canonical tag, + keyword-matched curated
  // niche tags) and collect the vocabulary. Seed the vocab with EVERY curated niche tag so the whole
  // set is available for a student's free-text interest to match against, even the specific ones no
  // terse listing description happens to mention yet.
  const nicheVocab = new Map<string, string>(); // slug -> label
  for (const c of curatedNiche) nicheVocab.set(c.slug, c.label);
  for (const l of listings) {
    const pairs = rawTags.get(`${l.source}:${l.external_id}`) ?? [];
    const slugs = new Set<string>();
    for (const p of pairs) {
      if (l.tag_slugs.includes(p.slug)) continue; // already canonical
      slugs.add(p.slug);
      if (!nicheVocab.has(p.slug)) nicheVocab.set(p.slug, p.label);
    }
    const text = `${l.title} ${l.short_description ?? ""} ${l.long_description ?? ""} ${l.industry ?? ""}`.toLowerCase();
    for (const c of curatedNiche) {
      if (slugs.has(c.slug)) continue;
      if (c.keywords.some((k) => text.includes(k))) {
        slugs.add(c.slug);
        if (!nicheVocab.has(c.slug)) nicheVocab.set(c.slug, c.label);
      }
    }
    l.niche_slugs = [...slugs];
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "listings.generated.json"), JSON.stringify(listings));
  writeFileSync(join(outDir, "tags.generated.json"), JSON.stringify(tags));
  writeFileSync(
    join(outDir, "niche-tags.json"),
    JSON.stringify([...nicheVocab.entries()].map(([slug, label]) => ({ slug, label }))),
  );

  const by = (key: (l: (typeof listings)[number]) => string) => {
    const m = new Map<string, number>();
    for (const l of listings) m.set(key(l), (m.get(key(l)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join("  ");
  };

  console.log(`data:build — ${listings.length} listings, ${tags.length} tags, ${nicheVocab.size} niche tags`);
  console.log(`  by source: ${by((l) => l.source)}`);
  console.log(`  by kind:   ${by((l) => l.kind)}`);
}

main();
