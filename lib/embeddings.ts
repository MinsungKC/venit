/**
 * MiniLM sentence embeddings via transformers.js (ONNX). Same model the browser will use
 * for the client-side user classifier later (BUILD_PROMPT §3), so tag vectors precomputed
 * here live in the same 384-dim space as the on-device user embedding.
 *
 * Node-only (used by the seed/classify scripts). Lazy-loads and caches the pipeline.
 */
import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIM = 384;

let extractor: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) extractor = pipeline("feature-extraction", EMBEDDING_MODEL);
  return extractor;
}

/** Embed one text into a normalized 384-dim vector. */
export async function embed(text: string): Promise<number[]> {
  const [v] = await embedBatch([text]);
  return v;
}

/** Embed a batch of texts (mean-pooled + L2-normalized), returning plain number arrays. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const extract = await getExtractor();
  const out = await extract(texts, { pooling: "mean", normalize: true });
  const rows = out.tolist() as number[][];
  return rows;
}

/** Cosine similarity of two L2-normalized vectors (dot product). */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
