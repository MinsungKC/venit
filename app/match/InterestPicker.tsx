"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LocMode, MatchTag } from "@/lib/match-data";

const RADIUS_OPTIONS = [10, 25, 50, 100, 250] as const;

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
  initialLocMode,
  initialPlace,
  initialRadiusMi,
}: {
  catalog: { domain: string; tags: MatchTag[] }[];
  initialSelected: string[];
  initialGrade: number | null;
  initialAge: number | null;
  initialLocMode: LocMode;
  initialPlace: string | null;
  initialRadiusMi: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState<string>(initialGrade?.toString() ?? "");
  const [age, setAge] = useState<string>(initialAge?.toString() ?? "");
  const [locMode, setLocMode] = useState<LocMode>(initialLocMode);
  const [place, setPlace] = useState<string>(initialPlace ?? "");
  const [radiusMi, setRadiusMi] = useState<number>(initialRadiusMi);
  const [locating, setLocating] = useState(false);

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

  async function findMatches() {
    const params = new URLSearchParams();
    if (selected.size) params.set("tags", [...selected].join(","));
    if (grade) params.set("grade", grade);
    if (age) params.set("age", age);
    if (locMode !== "any") params.set("loc", locMode);

    if (locMode === "near") {
      if (radiusMi !== 100) params.set("radius", String(radiusMi));
      if (place.trim()) {
        // Geocode the student's city on-submit so the radius measures from where they actually are.
        setLocating(true);
        try {
          const res = await fetch(`/api/geocode?q=${encodeURIComponent(place.trim())}`);
          if (res.ok) {
            const g = (await res.json()) as { lat: number; lng: number; label: string };
            params.set("ulat", g.lat.toFixed(4));
            params.set("ulng", g.lng.toFixed(4));
            params.set("place", g.label);
          } else {
            params.set("place", place.trim()); // keep the text; no coords → labs excluded, flagged in UI
          }
        } catch {
          params.set("place", place.trim());
        } finally {
          setLocating(false);
        }
      }
    }
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
        <label className="field">
          Location
          <select
            className="num state"
            value={locMode}
            onChange={(e) => setLocMode(e.target.value as LocMode)}
          >
            <option value="any">Anywhere — don&apos;t filter</option>
            <option value="country">Anywhere in the US</option>
            <option value="near">Near me (set radius)</option>
          </select>
        </label>

        {locMode === "near" && (
          <>
            <label className="field">
              My city
              <input
                className="num city"
                type="text"
                placeholder="e.g. San Diego, CA"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
              />
            </label>
            <label className="field">
              Within
              <select
                className="num"
                value={radiusMi}
                onChange={(e) => setRadiusMi(Number(e.target.value))}
              >
                {RADIUS_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r} mi
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <button className="button find" onClick={findMatches} disabled={selected.size === 0 || locating}>
          {locating ? "Locating…" : `Find matches${selected.size ? ` (${selected.size})` : ""}`}
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
