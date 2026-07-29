"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MatchTag } from "@/lib/match-data";

/**
 * The onboarding step (BUILD_PROMPT §6): pick interest chips (grouped by domain, searchable) plus
 * grade/age. Selections are encoded into the URL so matching runs server-side and results are
 * shareable. Nothing here is personality-related — only interest tags, which are always shown.
 */
export default function InterestPicker({
  catalog,
  initialSelected,
  initialGrade,
  initialAge,
}: {
  catalog: { domain: string; tags: MatchTag[] }[];
  initialSelected: string[];
  initialGrade: number | null;
  initialAge: number | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState<string>(initialGrade?.toString() ?? "");
  const [age, setAge] = useState<string>(initialAge?.toString() ?? "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog
      .map((g) => ({ ...g, tags: g.tags.filter((t) => t.label.toLowerCase().includes(q)) }))
      .filter((g) => g.tags.length > 0);
  }, [catalog, query]);

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function findMatches() {
    const params = new URLSearchParams();
    if (selected.size) params.set("tags", [...selected].join(","));
    if (grade) params.set("grade", grade);
    if (age) params.set("age", age);
    router.push(`/match?${params.toString()}`);
  }

  return (
    <section className="picker">
      <div className="picker-controls">
        <input
          className="search"
          type="search"
          placeholder="Search interests…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search interests"
        />
        <label className="field">
          Grade
          <input
            className="num"
            type="number"
            min={1}
            max={13}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          />
        </label>
        <label className="field">
          Age
          <input
            className="num"
            type="number"
            min={5}
            max={100}
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
        </label>
        <button className="button find" onClick={findMatches} disabled={selected.size === 0}>
          Find matches{selected.size ? ` (${selected.size})` : ""}
        </button>
      </div>

      <div className="domains">
        {filtered.map((g) => (
          <div className="domain" key={g.domain}>
            <h3 className="domain-name">{g.domain}</h3>
            <ul className="chips">
              {g.tags.map((t) => (
                <li key={t.slug}>
                  <button
                    className={`chip ${selected.has(t.slug) ? "on" : ""}`}
                    aria-pressed={selected.has(t.slug)}
                    onClick={() => toggle(t.slug)}
                  >
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
