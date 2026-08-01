"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { embedText, warmUpEmbedder, type LoadProgress } from "@/lib/embed-client";
import { assignInterestTags } from "@/lib/classifier";
import type { TagVector } from "@/lib/match-types";

/**
 * Free-text "what are you looking for?" search (BUILD_PROMPT §3/§6) — a shortcut into /match
 * that skips the full onboarding wizard. Two modes, like Google's regular vs. AI-mode search:
 *  - Plain (default): literal keyword match against listing names/tag labels via
 *    /api/keyword-search — zero cost, no model involved (§0.7). Finds a program by name (e.g.
 *    "beaver works" -> BWSI) and surfaces it plus similar listings via its own tags.
 *  - AI mode (opt-in, toggled via the sparkle icon): the query is embedded server-side (self-
 *    hosted model, §0.2/§0.7 — no paid API, no raw text stored) and matched semantically against
 *    the 109 canonical tags and 723 niche tags, for topic phrasing a literal search would miss
 *    (e.g. "marine biology research" -> Marine & Ocean Science).
 * Landing on /match with either merges identically into the existing tags+niche matching/ranking.
 *
 * A search is a LIGHTWEIGHT, non-destructive lookup — it must not overhaul the student's algorithm.
 * It keeps their existing interests and just marks the found tags as the "focus" so matching
 * listings LEAD the feed, with the rest of their normal, personalized feed still below. It does not
 * replace the feed and does not touch their SAVED profile (no permanent change) — clearing the
 * search / clicking Matches returns to their full feed exactly as it was.
 */
let tagVectorsPromise: Promise<TagVector[]> | null = null;
function loadTagVectors(): Promise<TagVector[]> {
  if (!tagVectorsPromise) {
    tagVectorsPromise = fetch("/data/tag-vectors.json").then((r) => r.json() as Promise<TagVector[]>);
  }
  return tagVectorsPromise;
}

interface SearchBarProps {
  /** Interest tags the student already has selected (from the current /match filters). */
  existingTags?: string[];
  /** Current /match URL with `tags` stripped, e.g. "/match?grade=10&sort=cost" — the search
   *  result is appended onto this so other filters (location, sort, kind…) survive a search. */
  basePath?: string;
  /** Whether the student is signed in — gates the adaptive profile save. */
  signedIn?: boolean;
}

export default function SearchBar({ existingTags = [], basePath = "/match?" }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const onProgress = (p: LoadProgress) => setPct(p.progress ?? 0);

  async function runAiSearch(q: string): Promise<string[]> {
    const [tagVectors, vector] = await Promise.all([loadTagVectors(), embedText(q, onProgress)]);

    let tagSlugs = assignInterestTags(vector, tagVectors, { threshold: 0.28, topK: 8 });
    // An obscure phrase can score below threshold on every canonical tag — fall back to the
    // nearest few rather than landing on an empty, tag-less search.
    if (tagSlugs.length === 0) {
      tagSlugs = assignInterestTags(vector, tagVectors, { threshold: 0, topK: 3 });
    }

    try {
      const res = await fetch("/api/niche", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vector }),
      });
      if (res.ok) {
        const d = (await res.json()) as { tags: { slug: string }[] };
        const nicheSlugs = d.tags.map((t) => t.slug);
        return [...new Set([...tagSlugs, ...nicheSlugs])];
      }
    } catch {
      /* niche match is a bonus, not required */
    }
    return tagSlugs;
  }

  async function runPlainSearch(q: string): Promise<string[]> {
    const res = await fetch("/api/keyword-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q }),
    });
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    const d = (await res.json()) as { tagSlugs: string[] };
    return d.tagSlugs;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || busy) return;

    setBusy(true);
    setPct(0);
    setErr(null);
    try {
      const found = aiMode ? await runAiSearch(q) : await runPlainSearch(q);
      if (found.length === 0) {
        setErr(
          aiMode
            ? "No matches for that — try different words."
            : "No name/tag match for that — try AI mode for a broader search.",
        );
        return;
      }

      // Minimal, non-destructive: union the found tags into the current interests and mark them as
      // the "focus" so matching listings LEAD the feed — the student's normal feed still shows below,
      // and nothing about their saved profile/algorithm changes. Clearing the search restores it.
      const merged = [...new Set([...existingTags, ...found])];
      const url = new URL(basePath, window.location.origin);
      url.searchParams.set("tags", merged.join(","));
      url.searchParams.set("focus", found.join(","));
      router.push(`${url.pathname}?${url.searchParams.toString()}`);
    } catch {
      setErr("Search couldn't run right now — try Get Started instead.");
    } finally {
      // Landing on /match only changes the query string (same route), so this component instance
      // can survive the navigation instead of unmounting — reset busy or the input stays stuck
      // disabled after the first search.
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
        placeholder={
          aiMode
            ? "Describe what you're into — “marine biology research”, “coding internship”…"
            : "Search by name or keyword — “Beaver Works”, “marine biology”…"
        }
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => aiMode && warmUpEmbedder(onProgress)}
        disabled={busy}
        aria-label="Search for opportunities"
      />
      <button
        type="button"
        className={`search-ai-toggle${aiMode ? " on" : ""}`}
        aria-pressed={aiMode}
        aria-label="Toggle AI search mode"
        title={aiMode ? "AI mode on — understands topics/phrasing" : "AI mode off — plain keyword search"}
        onClick={() => setAiMode((v) => !v)}
      >
        <span className="material-symbols-outlined">auto_awesome</span>
        AI
      </button>
      <button className="search-submit" type="submit" disabled={busy || !query.trim()}>
        {busy ? (pct > 0 ? `${pct}%` : "…") : "Search"}
      </button>
      {err && <p className="search-err">{err}</p>}
    </form>
  );
}
