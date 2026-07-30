"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { embedText, warmUpEmbedder, type LoadProgress } from "@/lib/embeddings-browser";
import { assignInterestTags } from "@/lib/classifier";
import type { TagVector } from "@/lib/match-types";

/**
 * Free-text "what are you looking for?" search (BUILD_PROMPT §3/§6) — an on-device-AI shortcut
 * into /match that skips the full onboarding wizard. The query is embedded on the student's own
 * device (same MiniLM model/space as onboarding, §0.2/§0.7 — no per-request LLM call, nothing
 * uploaded but the resulting tag slugs) and matched two ways, exactly like the wizard's "any
 * other interests?" field:
 *  - against the 109 canonical tags (`assignInterestTags`, on-device) for the broad category, and
 *  - against the 723 niche tags (`POST /api/niche`) for specific phrasing the canonical taxonomy
 *    doesn't cover (e.g. "marine biology research" -> Marine & Ocean Science + a niche match).
 * Landing on /match with both merges identically into the existing tags+niche matching/ranking.
 */
let tagVectorsPromise: Promise<TagVector[]> | null = null;
function loadTagVectors(): Promise<TagVector[]> {
  if (!tagVectorsPromise) {
    tagVectorsPromise = fetch("/data/tag-vectors.json").then((r) => r.json() as Promise<TagVector[]>);
  }
  return tagVectorsPromise;
}

export default function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const onProgress = (p: LoadProgress) => setPct(p.progress ?? 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || busy) return;

    setBusy(true);
    setPct(0);
    setErr(null);
    try {
      const [tagVectors, vector] = await Promise.all([loadTagVectors(), embedText(q, onProgress)]);

      let tagSlugs = assignInterestTags(vector, tagVectors, { threshold: 0.28, topK: 8 });
      // An obscure phrase can score below threshold on every canonical tag — fall back to the
      // nearest few rather than landing on an empty, tag-less search.
      if (tagSlugs.length === 0) {
        tagSlugs = assignInterestTags(vector, tagVectors, { threshold: 0, topK: 3 });
      }

      let nicheSlugs: string[] = [];
      try {
        const res = await fetch("/api/niche", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ vector }),
        });
        if (res.ok) {
          const d = (await res.json()) as { tags: { slug: string }[] };
          nicheSlugs = d.tags.map((t) => t.slug);
        }
      } catch {
        /* niche match is a bonus, not required */
      }

      const params = new URLSearchParams();
      params.set("tags", tagSlugs.join(","));
      if (nicheSlugs.length) params.set("niche", nicheSlugs.join(","));
      router.push(`/match?${params.toString()}`);
    } catch {
      setErr("Search couldn't run on this device — try Get Started instead.");
      setBusy(false);
    }
  }

  return (
    <form className="search-bar" onSubmit={onSubmit}>
      <span className="material-symbols-outlined search-icon" aria-hidden="true">
        search
      </span>
      <input
        className="search-input"
        type="search"
        placeholder="Search what you're into — “marine biology research”, “coding internship”…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => warmUpEmbedder(onProgress)}
        disabled={busy}
        aria-label="Search for opportunities"
      />
      <button className="search-submit" type="submit" disabled={busy || !query.trim()}>
        {busy ? (pct > 0 ? `${pct}%` : "…") : "Search"}
      </button>
      {err && <p className="search-err">{err}</p>}
    </form>
  );
}
