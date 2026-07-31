/**
 * Head-to-head embedder eval: which model best resolves SHORT/ambiguous student queries to the
 * right canonical interest tag? Same methodology used to pick BGE originally. Embeds every tag
 * description (passage side) + a curated hard-query set (query side) with the chosen model, ranks
 * tags by cosine, and scores top-1 / top-3 accuracy against expected tags.
 *
 *   MODEL=bge npx tsx scripts/eval-embedder.ts        (current baseline)
 *   MODEL=gemma npx tsx scripts/eval-embedder.ts      (EmbeddingGemma-300m)
 *   MODEL=modernbert npx tsx scripts/eval-embedder.ts
 *
 * No DB, no app state — pure model comparison.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";
import { slugify } from "../lib/mapping";
import { cosine } from "../lib/vec";

interface ModelCfg {
  id: string;
  /** Prefix for short queries (retrieval query side). */
  queryPrefix: string;
  /** Prefix for passages (tag descriptions). */
  docPrefix: string;
}
const BGE_PREFIX = "Represent this sentence for searching relevant passages: ";
const MODELS: Record<string, ModelCfg> = {
  // Work on the current @xenova/transformers v2 (BERT-family):
  bge: { id: "Xenova/bge-base-en-v1.5", queryPrefix: BGE_PREFIX, docPrefix: "" }, // current, 768d
  gtebase: { id: "Xenova/gte-base", queryPrefix: "", docPrefix: "" }, // 768d, no prefixes
  bgelarge: { id: "Xenova/bge-large-en-v1.5", queryPrefix: BGE_PREFIX, docPrefix: "" }, // 1024d
  mxbai: { id: "mixedbread-ai/mxbai-embed-large-v1", queryPrefix: BGE_PREFIX, docPrefix: "" }, // 1024d
  e5large: { id: "Xenova/e5-large-v2", queryPrefix: "query: ", docPrefix: "passage: " }, // 1024d
  // Require @huggingface/transformers v3 (won't load on v2 — kept for reference):
  gemma: { id: "onnx-community/embeddinggemma-300m-ONNX", queryPrefix: "task: search result | query: ", docPrefix: "title: none | text: " },
  modernbert: { id: "nomic-ai/modernbert-embed-base", queryPrefix: "search_query: ", docPrefix: "search_document: " },
};

/** Hard/short queries → the canonical tag label(s) a good embedder should surface in the top 3. */
const CASES: { q: string; expect: string[] }[] = [
  { q: "wildfire", expect: ["Climate Science", "Environmental Science"] },
  { q: "narwhals", expect: ["Marine & Ocean Science"] },
  { q: "picking stocks", expect: ["Finance & Investing", "Quantitative Finance"] },
  { q: "building rockets", expect: ["Aerospace Engineering", "Space Exploration"] },
  { q: "coding video games", expect: ["Game Development"] },
  { q: "curing cancer", expect: ["Cancer Research"] },
  { q: "protein folding", expect: ["Biochemistry", "Bioinformatics", "Molecular & Cell Biology"] },
  { q: "self-driving cars", expect: ["Autonomous Vehicles"] },
  { q: "writing poetry", expect: ["Creative Writing"] },
  { q: "3D printing", expect: ["Manufacturing & Hardware", "Product & Industrial Design"] },
  { q: "debate club", expect: ["Debate & Model UN"] },
  { q: "brain surgery", expect: ["Medicine & Clinical Health", "Neuroscience"] },
  { q: "renewable energy", expect: ["Sustainability & Clean Energy", "Energy & Power"] },
  { q: "marine biology", expect: ["Marine & Ocean Science", "Ecology & Evolution"] },
  { q: "hacking computers", expect: ["Cybersecurity"] },
  { q: "helping refugees", expect: ["Social Work & Advocacy", "Nonprofit & Community", "International Relations"] },
  { q: "designing buildings", expect: ["Architecture"] },
  { q: "the stock market crash of 1929", expect: ["Economics", "History", "Finance & Investing"] },
  { q: "teaching kids to read", expect: ["Education & Teaching"] },
  { q: "star formation", expect: ["Astronomy & Astrophysics"] },
];

async function main() {
  const key = process.env.MODEL ?? "bge";
  const cfg = MODELS[key];
  if (!cfg) throw new Error(`Unknown MODEL=${key}. Options: ${Object.keys(MODELS).join(", ")}`);
  console.log(`\n=== ${key} (${cfg.id}) ===`);

  const tags = JSON.parse(
    readFileSync(join(process.cwd(), "supabase", "seed", "taxonomy.json"), "utf8"),
  ) as { label: string; description: string }[];

  const extractor: FeatureExtractionPipeline = await pipeline("feature-extraction", cfg.id, { quantized: true });
  const embed = async (text: string): Promise<number[]> => {
    const out = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(out.data as Float32Array);
  };

  // Embed all tag descriptions (passage side).
  const tagVecs: { label: string; vec: number[] }[] = [];
  for (const t of tags) tagVecs.push({ label: t.label, vec: await embed(`${cfg.docPrefix}${t.label}. ${t.description}`) });

  let top1 = 0;
  let top3 = 0;
  for (const c of CASES) {
    const qv = await embed(`${cfg.queryPrefix}${c.q}`);
    const ranked = tagVecs
      .map((t) => ({ label: t.label, s: cosine(qv, t.vec) }))
      .sort((a, b) => b.s - a.s);
    const top3Labels = ranked.slice(0, 3).map((r) => r.label);
    const hit1 = c.expect.includes(top3Labels[0]);
    const hit3 = top3Labels.some((l) => c.expect.includes(l));
    if (hit1) top1++;
    if (hit3) top3++;
    const mark = hit1 ? "✓1" : hit3 ? "·3" : "✗ ";
    console.log(`  ${mark} ${c.q.padEnd(30)} → ${top3Labels.join(" | ")}`);
  }
  console.log(`\n  top-1: ${top1}/${CASES.length}   top-3: ${top3}/${CASES.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
