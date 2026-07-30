/**
 * BGE sentence embeddings via transformers.js (ONNX), self-hosted — no paid third-party API.
 * Runs server-side only: build-time (seed/classify scripts) AND at request time behind
 * /api/embed, which the browser calls instead of running the model itself. We moved off
 * on-device MiniLM because its quality was too weak on short/ambiguous queries (e.g. "wildfire"
 * scored highest against "Space Exploration", nowhere near Climate/Environmental Science).
 * bge-small-en-v1.5 fixed that case but still failed on other short/specific queries (e.g.
 * "narwhals" matched no biology/ocean tag anywhere in the top 10, even with sentence-context
 * augmentation) — tested head-to-head, bge-base-en-v1.5 resolves it decisively (top match:
 * Marine & Ocean Science at 0.60) with no prompt tricks needed, so we upgraded to base despite
 * the larger footprint. Dimension went 384 -> 768 (see migration 0005).
 *
 * BGE is trained for ASYMMETRIC retrieval: passages (tag/niche descriptions, archetype anchor
 * text, listing text) are embedded plain via `embed`/`embedBatch`; short ad-hoc queries (a
 * student's search text, free-text interests, adjectives) should go through `embedQuery`, which
 * adds BGE's recommended instruction prefix — skipping it measurably hurts retrieval quality.
 *
 * Node-only, used by both standalone seed/classify scripts (run via tsx, outside Next's
 * bundler — no "server-only" guard here since that module only resolves inside Next's webpack)
 * and /api/embed. Lazy-loads and caches the pipeline.
 */
import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

export const EMBEDDING_MODEL = "Xenova/bge-base-en-v1.5";
export const EMBEDDING_DIM = 768;

/** BGE's recommended instruction prefix for retrieval queries (not used on the passage side). */
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

let extractor: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) extractor = pipeline("feature-extraction", EMBEDDING_MODEL, { quantized: true });
  return extractor;
}

/** Embed one passage (catalog text: tag/niche description, archetype anchor, listing text). */
export async function embed(text: string): Promise<number[]> {
  const [v] = await embedBatch([text]);
  return v;
}

/** Embed a batch of passages (mean-pooled + L2-normalized), returning plain number arrays. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const extract = await getExtractor();
  const out = await extract(texts, { pooling: "mean", normalize: true });
  const rows = out.tolist() as number[][];
  return rows;
}

/** Embed one short ad-hoc query (search text, free-text interests/adjectives) — BGE-prefixed. */
export async function embedQuery(text: string): Promise<number[]> {
  return embed(`${QUERY_PREFIX}${text}`);
}

// Cosine lives in the dependency-free lib/vec.ts so comparing vectors never pulls in the model
// runtime; re-exported here for the seed scripts that already import it alongside embed().
export { cosine } from "./vec";
