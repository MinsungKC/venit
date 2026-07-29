"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MatchTag } from "@/lib/match-data";
import styles from "./onboarding.module.css";

/**
 * The onboarding wizard (BUILD_PROMPT §6): a short (≤ 4 steps) flow with a progress bar that ends
 * by navigating straight to `/match` results. Only interest tags are collected/shown here —
 * adjectives/resume-derived personality come later and never appear in this flow (guardrail §0.1).
 *
 * Step 1 picks interest tags (domain-grouped, searchable chips; ≥ 1 required to proceed). Step 2
 * gathers optional grade/age. The final "See my matches" button encodes the selections into the
 * query string so matching runs server-side and results are shareable — the same contract the
 * `/match` page reads (`?tags=slug1,slug2&grade=<n>&age=<n>`, empty params omitted).
 */
const STEPS = ["Interests", "About you"] as const;

export default function OnboardingWizard({
  catalog,
}: {
  catalog: { domain: string; tags: MatchTag[] }[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("");
  const [age, setAge] = useState("");

  // Filter the catalog by the search box, dropping domains that end up with no visible tags.
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

  // Encode the (editable) selections and land straight on the results page (§6).
  function seeMatches() {
    const params = new URLSearchParams();
    if (selected.size) params.set("tags", [...selected].join(","));
    if (grade) params.set("grade", grade);
    if (age) params.set("age", age);
    router.push(`/match?${params.toString()}`);
  }

  const isLast = step === STEPS.length - 1;
  const canAdvance = step === 0 ? selected.size > 0 : true;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <section className={styles.wizard}>
      {/* Step indicator + progress bar — everything stays editable by going Back. */}
      <div className={styles.progress}>
        <ol className={styles.steps}>
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`${styles.stepDot} ${i === step ? styles.stepCurrent : ""} ${
                i < step ? styles.stepDone : ""
              }`}
            >
              <span className={styles.stepNum}>{i + 1}</span>
              <span className={styles.stepLabel}>{label}</span>
            </li>
          ))}
        </ol>
        <div className={styles.bar} role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
          <div className={styles.barFill} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {step === 0 && (
        <div className={styles.panel}>
          <div className={styles.stepHead}>
            <h2 className={styles.stepTitle}>What are you into?</h2>
            <p className={styles.caption}>
              Pick at least one. These interests are the only thing used to show you matches —
              nothing else about you is shared.
            </p>
          </div>

          <input
            className={styles.search}
            type="search"
            placeholder="Search interests…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search interests"
          />

          <div className={styles.domains}>
            {filtered.map((g) => (
              <div className={styles.domain} key={g.domain}>
                <h3 className={styles.domainName}>{g.domain}</h3>
                <ul className={styles.chips}>
                  {g.tags.map((t) => (
                    <li key={t.slug}>
                      <button
                        type="button"
                        className={`${styles.chip} ${selected.has(t.slug) ? styles.chipOn : ""}`}
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
        </div>
      )}

      {step === 1 && (
        <div className={styles.panel}>
          <div className={styles.stepHead}>
            <h2 className={styles.stepTitle}>A little about you</h2>
            <p className={styles.caption}>
              Optional — helps us hide opportunities you&apos;re not eligible for. Skip if you&apos;d rather.
            </p>
          </div>

          <div className={styles.fields}>
            <label className={styles.field}>
              Grade
              <input
                className={styles.num}
                type="number"
                min={1}
                max={13}
                placeholder="9"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              Age
              <input
                className={styles.num}
                type="number"
                min={5}
                max={100}
                placeholder="14"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </label>
          </div>
        </div>
      )}

      {/* Nav: Back is available after step 1; Next is disabled on step 1 until ≥ 1 interest. */}
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Back
        </button>

        {isLast ? (
          <button type="button" className={styles.primary} onClick={seeMatches}>
            See my matches{selected.size ? ` (${selected.size})` : ""}
          </button>
        ) : (
          <button
            type="button"
            className={styles.primary}
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={!canAdvance}
          >
            Next
          </button>
        )}
      </div>
    </section>
  );
}
