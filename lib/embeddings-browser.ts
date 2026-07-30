/**
 * Browser-side MiniLM embedder (BUILD_PROMPT §3) — runs entirely on the user's device via
 * transformers.js + onnxruntime-web (WASM). Same model/space as the build-time tag vectors
 * (Xenova/all-MiniLM-L6-v2, 384-dim, mean-pooled + L2-normalized), so a user embedding compares
 * directly against the committed public/data/*-vectors.json.
 *
 * Client-only. The library + model (~25 MB, quantized) are lazy-loaded on first use (dynamic
 * import), so nothing here weighs on initial page load. Guardrail §0.2/§0.3: text is embedded on
 * device and never uploaded — only the resulting tag IDs / vector leave, and only where wired.
 */

/** transformers.js progress events during the one-time model download. */
export interface LoadProgress {
  status: string; // "downloading" | "ready" | ...
  file?: string;
  progress?: number; // 0–100 for the current file
}

/** The narrow slice of the transformers.js pipeline we use (avoids importing its types eagerly). */
type FeatureExtractor = (
  text: string,
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array }>;

let pipePromise: Promise<FeatureExtractor> | null = null;

/** Lazily construct (and cache) the feature-extraction pipeline. */
function getPipe(onProgress?: (p: LoadProgress) => void): Promise<FeatureExtractor> {
  if (!pipePromise) {
    pipePromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      // Fetch the model from the HuggingFace CDN and cache it in the browser (no local models).
      env.allowLocalModels = false;
      const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        quantized: true,
        progress_callback: onProgress,
      });
      return pipe as unknown as FeatureExtractor;
    })();
  }
  return pipePromise;
}

/** Kick off the model download early (e.g. on step focus) so it's warm when the user submits. */
export function warmUpEmbedder(onProgress?: (p: LoadProgress) => void): void {
  void getPipe(onProgress);
}

/** Embed one text into a 384-dim, L2-normalized vector, on-device. */
export async function embedText(
  text: string,
  onProgress?: (p: LoadProgress) => void,
): Promise<number[]> {
  const pipe = await getPipe(onProgress);
  const out = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(out.data);
}
