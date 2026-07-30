/**
 * Build the static dataset the /listings + /match pages read.
 *   npm run data:build  ->  public/data/listings.generated.json + tags.generated.json + niche-tags.json
 *
 * Also retains each listing's SPECIFIC source tags (yc keywords, OpenAlex subfields…) as
 * `niche_slugs`, so a student's free-text niche interest ("fire monitoring") can match companies
 * carrying a close niche tag — even when it doesn't map to one of the ~109 canonical tags.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAllListings } from "../lib/sources";
import { buildDataset, labelsToSlugPairs } from "../lib/mapping";
import { applyClassification, applyTaxonomyDomains } from "../lib/classification";

const outDir = join(process.cwd(), "public", "data");

function main() {
  const raw = loadAllListings();

  // Original source tags per listing (before canonicalization), for niche matching.
  const rawTags = new Map<string, { slug: string; label: string }[]>();
  for (const l of raw) rawTags.set(`${l.source}:${l.external_id}`, labelsToSlugPairs(l.tag_labels));

  const built = buildDataset(applyClassification(raw));
  const listings = built.listings;
  const tags = applyTaxonomyDomains(built.tags);

  // Attach niche slugs (source tags that aren't already a canonical tag) + collect the vocabulary.
  const nicheVocab = new Map<string, string>(); // slug -> label
  for (const l of listings) {
    const pairs = rawTags.get(`${l.source}:${l.external_id}`) ?? [];
    const canonical = new Set(l.tag_slugs);
    const niche = pairs.filter((p) => !canonical.has(p.slug));
    l.niche_slugs = niche.map((p) => p.slug);
    for (const p of niche) if (!nicheVocab.has(p.slug)) nicheVocab.set(p.slug, p.label);
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
