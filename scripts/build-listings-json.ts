/**
 * Build the static dataset the /listings page reads when no database is connected.
 * Applies the SAME mapping (lib/mapping.ts) the Postgres importer uses, so what you
 * see without Docker matches what lands in Supabase.
 *
 *   npm run data:build  ->  public/data/listings.generated.json + tags.generated.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadCompanies } from "../lib/source";
import { buildDataset } from "../lib/mapping";

const outDir = join(process.cwd(), "public", "data");

function main() {
  const companies = loadCompanies();
  const { listings, tags } = buildDataset(companies);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "listings.generated.json"), JSON.stringify(listings));
  writeFileSync(join(outDir, "tags.generated.json"), JSON.stringify(tags));

  const hiring = listings.filter((l) => l.is_recruiting).length;
  console.log(
    `data:build — ${listings.length} listings, ${tags.length} tags ` +
      `(${hiring} hiring / ${listings.length - hiring} not actively recruiting) ` +
      `from ${companies.length} source companies`,
  );
}

main();
