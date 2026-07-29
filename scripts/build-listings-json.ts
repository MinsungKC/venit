/**
 * Build the static dataset the /listings page reads when no database is connected.
 * Applies the SAME mapping/buildDataset the Postgres importer uses across ALL sources
 * (yc, S&P 500, curated), so what you see without Docker matches what lands in Supabase.
 *
 *   npm run data:build  ->  public/data/listings.generated.json + tags.generated.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAllListings } from "../lib/sources";
import { buildDataset } from "../lib/mapping";
import { applyClassification, applyTaxonomyDomains } from "../lib/classification";

const outDir = join(process.cwd(), "public", "data");

function main() {
  const items = applyClassification(loadAllListings());
  const built = buildDataset(items);
  const listings = built.listings;
  const tags = applyTaxonomyDomains(built.tags);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "listings.generated.json"), JSON.stringify(listings));
  writeFileSync(join(outDir, "tags.generated.json"), JSON.stringify(tags));

  const by = (key: (l: (typeof listings)[number]) => string) => {
    const m = new Map<string, number>();
    for (const l of listings) m.set(key(l), (m.get(key(l)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join("  ");
  };

  console.log(`data:build — ${listings.length} listings, ${tags.length} tags`);
  console.log(`  by source: ${by((l) => l.source)}`);
  console.log(`  by kind:   ${by((l) => l.kind)}`);
}

main();
