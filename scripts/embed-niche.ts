/**
 * Precompute embeddings for the niche-tag vocabulary (public/data/niche-tags.json from data:build).
 *
 *   npm run data:niche  ->  public/data/niche-vectors.json  [{ slug, label, vector[384] }]
 *
 * Same MiniLM space as the canonical tag/archetype vectors, so the on-device classifier can match
 * a student's free-text niche interest ("fire monitoring") against these specific source tags.
 * Build-time only (no per-request AI, §0.6).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { embedBatch } from "../lib/embeddings";

const DIR = join(process.cwd(), "public", "data");
const IN = join(DIR, "niche-tags.json");
const OUT = join(DIR, "niche-vectors.json");
const BATCH = 64;

async function main() {
  if (!existsSync(IN)) throw new Error(`Missing ${IN}. Run \`npm run data:build\` first.`);
  const tags = JSON.parse(readFileSync(IN, "utf8")) as { slug: string; label: string }[];
  console.log(`embed-niche — ${tags.length} niche tags`);

  const vectors: number[][] = [];
  for (let i = 0; i < tags.length; i += BATCH) {
    const rows = await embedBatch(tags.slice(i, i + BATCH).map((t) => t.label));
    vectors.push(...rows);
    if ((i / BATCH) % 10 === 0 || i + BATCH >= tags.length) {
      process.stdout.write(`  ${Math.min(i + BATCH, tags.length)}/${tags.length}\n`);
    }
  }

  writeFileSync(OUT, JSON.stringify(tags.map((t, i) => ({ ...t, vector: vectors[i] }))));
  console.log(`embed-niche — wrote ${tags.length} niche vectors.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
