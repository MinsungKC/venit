/**
 * Client-side helper that runs embedding THROUGH OUR SERVER, not on the student's device
 * (BUILD_PROMPT §3, revised). `embedText` POSTs to /api/embed, which runs the self-hosted BGE
 * model server-side (lib/embeddings.ts) and returns the 768-dim vector. We moved off the old
 * in-browser MiniLM because its quality was too weak on short/ambiguous queries ("wildfire"
 * matched "Space Exploration" over Climate/Environmental Science) — and this also drops the
 * ~25 MB in-browser model download and keeps heavy compute off low-end phones.
 *
 * PRIVACY NOTE: the text (scrubbed of PII on-device first) crosses the network to our own server,
 * where it is embedded and NOT stored or logged — only the resulting vector is returned. This is a
 * deliberate revision of the original "only tag IDs leave the device" stance (§0.2), traded for
 * materially better match quality. Never a paid third-party API.
 */

/** Kept for call-site compatibility with the old on-device downloader; no download happens now. */
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
