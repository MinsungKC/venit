"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TagOption } from "@/lib/listings";

const STORAGE_KEY = "oppmatch.interests";

/**
 * Local-first interest picker (BUILD_PROMPT §7): selection lives in the URL (so results are
 * server-rendered and shareable) and is remembered in localStorage across visits — no account
 * required. Only interest tags are ever handled here; there is no personality data.
 */
export default function InterestPicker({
  tags,
  selected,
}: {
  tags: TagOption[];
  selected: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedKey = selected.join(",");

  // Group tags by domain once.
  const groups = useMemo(() => {
    const byDomain = new Map<string, TagOption[]>();
    for (const t of tags) {
      const d = t.domain ?? "Other";
      (byDomain.get(d) ?? byDomain.set(d, []).get(d)!).push(t);
    }
    return [...byDomain.entries()];
  }, [tags]);

  // Build a URL for a given tag selection, preserving the active `kind` filter.
  function hrefFor(next: string[]): string {
    const params = new URLSearchParams(searchParams.toString());
    if (next.length) params.set("tags", next.join(","));
    else params.delete("tags");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function toggle(slug: string) {
    const next = selectedSet.has(slug)
      ? selected.filter((s) => s !== slug)
      : [...selected, slug];
    router.push(hrefFor(next), { scroll: false });
  }

  function clearAll() {
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    router.push(hrefFor([]), { scroll: false });
  }

  // On first load with an empty URL, re-apply the interests remembered from a past visit.
  useEffect(() => {
    if (selected.length > 0) return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const savedTags = saved ? saved.split(",").filter(Boolean) : [];
    if (savedTags.length) router.replace(hrefFor(savedTags), { scroll: false });
    // mount-only: intentionally not re-running on selection/router changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist selection (skip the initial render so we never clobber a remembered value).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (selected.length) window.localStorage.setItem(STORAGE_KEY, selectedKey);
    else window.localStorage.removeItem(STORAGE_KEY);
  }, [selectedKey, selected.length]);

  const q = query.trim().toLowerCase();
  const selectedTags = tags.filter((t) => selectedSet.has(t.slug));

  return (
    <details className="picker" open={selected.length === 0}>
      <summary className="picker-summary">
        <span>Choose your interests</span>
        {selected.length > 0 && <span className="picker-count">{selected.length}</span>}
      </summary>

      <div className="picker-body">
        <p className="picker-hint">
          Pick what you&apos;re into — we&apos;ll show only listings that share at least one of
          your interests, strongest matches first.
        </p>

        {selectedTags.length > 0 && (
          <div className="picker-selected">
            {selectedTags.map((t) => (
              <button
                key={t.slug}
                type="button"
                className="chip on"
                onClick={() => toggle(t.slug)}
                aria-label={`Remove ${t.label}`}
              >
                {t.label} <span aria-hidden="true">×</span>
              </button>
            ))}
            <button type="button" className="picker-clear" onClick={clearAll}>
              Clear all
            </button>
          </div>
        )}

        <input
          className="picker-search"
          type="search"
          placeholder="Search interests…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search interests"
        />

        <div className="picker-groups">
          {groups.map(([domain, opts]) => {
            const visible = q ? opts.filter((t) => t.label.toLowerCase().includes(q)) : opts;
            if (visible.length === 0) return null;
            return (
              <div className="domain-group" key={domain}>
                <h3 className="domain-h">{domain}</h3>
                <div className="chips">
                  {visible.map((t) => {
                    const on = selectedSet.has(t.slug);
                    return (
                      <button
                        key={t.slug}
                        type="button"
                        className={`chip ${on ? "on" : ""}`}
                        aria-pressed={on}
                        onClick={() => toggle(t.slug)}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}
