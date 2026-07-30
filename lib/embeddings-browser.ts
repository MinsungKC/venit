/**
 * Client-side interface to the server-hosted embedder (BUILD_PROMPT §3). Embedding now runs on
 * OUR server (POST /api/embed, self-hosted BGE via transformers.js — no paid third-party API,
 * lib/embeddings.ts) rather than in the browser: on-device MiniLM's quality was too weak on
 * short/ambiguous queries ("wildfire" matched "Space Exploration" over Climate/Environmental
 * Science). This also drops the ~25 MB in-browser model download.
 *
 * Same exported shape as the old on-device version (`embedText` / `warmUpEmbedder` /
 * `LoadProgress`) so callers (onboarding wizard, search bar) needed zero changes. Only the
 * resulting vector crosses the network — never stored server-side (§0.2/§0.3).
 */

/** Kept for call-site compatibility with the old on-device downloader; no download happens now,
 *  so at most one "ready" event fires once embedding completes. */
export interface LoadProgress {
  status: string;
  file?: string;
  progress?: number; // 0–100
}

async function postEmbed(text: string): Promise<number[]> {
  const res = await fetch("/api/embed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`embed failed: ${res.status}`);
  const data = (await res.json()) as { vector: number[] };
  return data.vector;
}

/**
 * Kick off a throwaway embed call early (e.g. on step focus) so the server's model is warm
 * (lazy-loaded on first use) by the time the student actually submits.
 */
export function warmUpEmbedder(onProgress?: (p: LoadProgress) => void): void {
  postEmbed(".")
    .then(() => onProgress?.({ status: "ready", progress: 100 }))
    .catch(() => {
      /* best-effort warmup only */
    });
}

/** Embed one text into a 768-dim, L2-normalized vector via the server. */
export async function embedText(
  text: string,
  onProgress?: (p: LoadProgress) => void,
): Promise<number[]> {
  const vector = await postEmbed(text);
  onProgress?.({ status: "ready", progress: 100 });
  return vector;
}
