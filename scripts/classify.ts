/**
 * Classify every listing into the canonical interest taxonomy using embeddings.
 *
 *   npm run data:classify
 *   -> public/data/classification.json  { "source:external_id": ["tag-slug", ...] }
 *   -> public/data/tag-vectors.json     [{ slug, label, domain, vector[768] }]
 *
 * We embed each taxonomy tag (label + description) and each listing (title + description +
 * source signals) with the SAME embedding model, then assign each listing its nearest tags by
 * cosine similarity (top-k above a threshold, always at least one). This unifies the
 * heterogeneous source tags (yc tags / GICS sectors / OpenAlex fields) into one consistent
 * vocabulary and precomputes the tag vectors the student's search/classifier queries match
 * against (via /api/embed).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAllListings } from "../lib/sources";
import { embedBatch, cosine } from "../lib/embeddings";
import type { NormalizedListing } from "../lib/mapping";

const OUT_DIR = join(process.cwd(), "public", "data");
const TAXONOMY = join(process.cwd(), "supabase", "seed", "taxonomy.json");

const TOP_K = 6;
const THRESHOLD = 0.28;
// Relative cutoff: a tag is only kept if it scores within MARGIN of the listing's BEST tag. The
// absolute THRESHOLD alone let a weak trailing tag (~0.29) ride along on listings whose real tags
// score much higher (~0.5) — e.g. a fashion or plant-science program picking up `aerospace-
// engineering` as a noisy 6th tag, which then surfaced it under an unrelated interest filter (§4).
// Keeping only tags near the listing's own peak means each listing matches on what it's actually
// about. The top tag is always kept (a listing gets ≥1 tag; a 0-tag listing is dropped upstream).
const MARGIN = 0.08;
const BATCH = 64;

interface TaxonomyTag {
  slug: string;
  label: string;
  domain: string;
  description: string;
}

function listingDoc(l: NormalizedListing): string {
  return [l.title, l.short_description, l.industry, l.subindustry, l.tag_labels.join(", ")]
    .filter(Boolean)
    .join(". ");
}

async function embedAll(texts: string[], label: string): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const rows = await embedBatch(texts.slice(i, i + BATCH));
    vectors.push(...rows);
    if ((i / BATCH) % 20 === 0 || i + BATCH >= texts.length) {
      process.stdout.write(`  ${label}: ${Math.min(i + BATCH, texts.length)}/${texts.length}\n`);
    }
  }
  return vectors;
}

async function main() {
  const taxonomy = JSON.parse(readFileSync(TAXONOMY, "utf8")) as TaxonomyTag[];
  const listings = loadAllListings();
  console.log(`classify — ${taxonomy.length} tags, ${listings.length} listings`);

  const tagVecs = await embedAll(
    taxonomy.map((t) => `${t.label}. ${t.description}`),
    "tags",
  );

  // TAGS_ONLY: regenerate just tag-vectors.json (e.g. after an embedding-model swap) without the
  // full 15k-listing re-classification. The existing classification.json (tag SLUGS, dimension-
  // independent) stays valid; re-run without this flag later to also improve tag assignments.
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "tag-vectors.json"),
    JSON.stringify(taxonomy.map((t, i) => ({ ...t, vector: tagVecs[i] }))),
  );
  if (process.env.TAGS_ONLY === "1") {
    console.log(`classify — TAGS_ONLY: wrote ${taxonomy.length} tag vectors (skipped listing pass).`);
    return;
  }

  const listingVecs = await embedAll(listings.map(listingDoc), "listings");

  const classification: Record<string, string[]> = {};
  for (let i = 0; i < listings.length; i++) {
    const v = listingVecs[i];
    const scored = tagVecs
      .map((tv, ti) => ({ slug: taxonomy[ti].slug, score: cosine(v, tv) }))
      .sort((a, b) => b.score - a.score);
    const top = scored[0]?.score ?? 0;
    const picked = scored
      .filter((s) => s.score >= THRESHOLD && s.score >= top - MARGIN)
      .slice(0, TOP_K);
    const tags = (picked.length ? picked : scored.slice(0, 1)).map((s) => s.slug);
    classification[`${listings[i].source}:${listings[i].external_id}`] = tags;
  }

  writeFileSync(join(OUT_DIR, "classification.json"), JSON.stringify(classification));

  const counts = Object.values(classification).map((t) => t.length);
  const avg = (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(2);
  console.log(`classify — wrote ${counts.length} classifications (avg ${avg} tags each).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
