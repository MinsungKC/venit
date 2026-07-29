/**
 * Tiny, dependency-free vector math. Kept separate from `lib/embeddings.ts` (which pulls in the
 * transformers.js / onnxruntime model runtime) so the matching, similarity, and classifier libs —
 * and every server route that uses them — never drag the model into their bundle. The heavy model
 * is only needed to PRODUCE vectors (seed scripts, browser adapter); comparing them is pure math.
 */

/** Cosine similarity of two vectors. For L2-normalized inputs this is just the dot product. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
