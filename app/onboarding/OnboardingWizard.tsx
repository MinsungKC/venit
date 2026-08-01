"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { MatchTag } from "@/lib/match-data";
import type { ArchetypeVector, TagVector } from "@/lib/match-types";
import type { ListingKind } from "@/lib/mapping";
import { classifyUser } from "@/lib/user-classifier";
import { embedText, warmUpEmbedder } from "@/lib/embed-client";
import { scrubPII, type StrippedPII } from "@/lib/pii";
import { FINISH_EVENT } from "./OnboardingGlobe";
import RateDeck from "../refine/RateDeck";
import styles from "./onboarding.module.css";

/** One of the student's top matches, as returned by /api/match/top (student-safe fields only). */
interface TopMatch {
  slug: string;
  title: string;
  kind: ListingKind;
  matchedTags: string[];
  tagSlugs: string[];
  short_description: string | null;
  location: string | null;
  cost_type: string;
  url: string | null;
  fitLabel: string | null;
}
/**
 * Onboarding wizard (BUILD_PROMPT §6). Five playful steps with a progress bar:
 *  1. Looking for — which listing kinds to prioritize (optional; never a hard filter, §0.4).
 *  2. Broad interests  — pop the domain bubbles.
 *  3. Specific interests — bubbles for the tags inside the chosen domains.
 *  4. About you — optional extra interests + a few required adjectives (feed the SECRET personality).
 *  5. Resume — optional, parsed & PII-scrubbed on-device (§0.2/§0.3).
 * On finish we classify on-device, save the profile if signed in, and land on /match.
 */
const STEPS = ["Looking for", "Interests", "Specifics", "About you", "Resume"] as const;

// Persist in-progress onboarding to the device so a refresh (or coming back later) resumes where
// the student left off instead of resetting to step 0. Works for signed-in AND anonymous users.
// NB: the resume text/file is DELIBERATELY excluded here — guardrail §0.2 ("resumes are never
// persisted"): only the lightweight selections are stored, never the raw resume.
const STORAGE_KEY = "oppmatch:onboarding";
interface SavedOnboarding {
  step: number;
  kinds: string[];
  broad: string[];
  selected: string[];
  additional: string;
  adjectives: string;
  grade: number | null;
  age: number | null;
}

// Step-transition choreography (ms): the whole card flies off-screen (EXIT), the globe is shown
// alone while fresh waypoints drop (HOLD), then the next card glides back in.
const EXIT_MS = 560;
const HOLD_MS = 1700;

const KIND_OPTIONS: { value: ListingKind; label: string; desc: string; icon: string }[] = [
  { value: "company", label: "Companies", desc: "Startups & companies to work or intern at", icon: "business" },
  { value: "research_lab", label: "Research Labs", desc: "University & institute research opportunities", icon: "science" },
  { value: "program", label: "Programs", desc: "Multi-week academic or pre-college programs", icon: "school" },
  { value: "opportunity", label: "Opportunities", desc: "Internships, competitions, scholarships, job openings", icon: "work" },
  { value: "volunteer", label: "Volunteering", desc: "Community service & volunteer opportunities", icon: "volunteer_activism" },
  { value: "camp", label: "Camps", desc: "Summer camps & residential programs", icon: "cabin" },
];

const PALETTE = [
  "#8b7bff", "#22d3ee", "#ff5c9d", "#fcd34d", "#34d399", "#ff7a6b",
  "#60a5fa", "#c084fc", "#f472b6", "#4ade80", "#fb923c", "#38bdf8",
  "#a78bfa", "#2dd4bf", "#facc15", "#f87171",
];

function floatStyle(i: number): CSSProperties {
  return {
    ["--dur" as string]: `${4 + (i % 4)}s`,
    ["--delay" as string]: `${(i % 6) * 0.35}s`,
  };
}
function colorStyle(color: string): CSSProperties {
  return { ["--c" as string]: color };
}

export default function OnboardingWizard({
  catalog,
}: {
  catalog: { domain: string; tags: MatchTag[] }[];
}) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [mode, setMode] = useState<"form" | "finishing" | "results">("form");
  const [results, setResults] = useState<TopMatch[]>([]);
  const [allParams, setAllParams] = useState("");
  const [kinds, setKinds] = useState<Set<ListingKind>>(new Set());
  const [broad, setBroad] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [additional, setAdditional] = useState("");
  const [adjectives, setAdjectives] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [stripped, setStripped] = useState<StrippedPII[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const vectorsRef = useRef<{ tags: TagVector[]; archetypes: ArchetypeVector[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // `loaded` gates saving until AFTER the one-time restore below, so the empty initial state can't
  // clobber previously-saved progress on mount.
  const [loaded, setLoaded] = useState(false);

  // Restore saved progress once, on mount (in an effect, not a lazy initializer, so server and
  // client render the same empty form first and hydration stays consistent).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<SavedOnboarding>;
        if (typeof s.step === "number") setStep(Math.min(Math.max(s.step, 0), STEPS.length - 1));
        if (Array.isArray(s.kinds)) setKinds(new Set(s.kinds as ListingKind[]));
        if (Array.isArray(s.broad)) setBroad(new Set(s.broad));
        if (Array.isArray(s.selected)) setSelected(new Set(s.selected));
        if (typeof s.additional === "string") setAdditional(s.additional);
        if (typeof s.adjectives === "string") setAdjectives(s.adjectives);
        if (typeof s.grade === "number" || s.grade === null) setGrade(s.grade ?? null);
        if (typeof s.age === "number" || s.age === null) setAge(s.age ?? null);
      }
    } catch {
      /* corrupt/unavailable storage — just start fresh */
    }
    setLoaded(true);
  }, []);

  // Persist selections on every change (once restored). Resume text is never included (§0.2).
  useEffect(() => {
    if (!loaded) return;
    try {
      const snapshot: SavedOnboarding = {
        step,
        kinds: [...kinds],
        broad: [...broad],
        selected: [...selected],
        additional,
        adjectives,
        grade,
        age,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      /* storage full/blocked — non-fatal, just no resume-on-refresh */
    }
  }, [loaded, step, kinds, broad, selected, additional, adjectives, grade, age]);

  const domainColor = useMemo(() => {
    const m = new Map<string, string>();
    catalog.forEach((c, i) => m.set(c.domain, PALETTE[i % PALETTE.length]));
    return m;
  }, [catalog]);

  const domains = useMemo(() => catalog.map((c) => c.domain), [catalog]);
  const specificTags = useMemo(
    () => catalog.filter((c) => broad.has(c.domain)).flatMap((c) => c.tags),
    [catalog, broad],
  );
  const adjList = adjectives.split(/[,\n]/).map((a) => a.trim()).filter(Boolean);

  const toggle = (set: Set<string>, setSet: (n: Set<string>) => void, v: string) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    setSet(n);
  };
  const toggleKind = (v: ListingKind) => {
    setKinds((prev) => {
      const n = new Set(prev);
      n.has(v) ? n.delete(v) : n.add(v);
      return n;
    });
  };

  async function ensureVectors() {
    if (vectorsRef.current) return vectorsRef.current;
    const [tags, archetypes] = await Promise.all([
      fetch("/data/tag-vectors.json").then((r) => r.json() as Promise<TagVector[]>),
      fetch("/data/archetype-vectors.json").then((r) => r.json() as Promise<ArchetypeVector[]>),
    ]);
    vectorsRef.current = { tags, archetypes };
    return vectorsRef.current;
  }

  function onResume(text: string) {
    setResumeText(text);
    setStripped(text.trim() ? scrubPII(text).stripped : []);
  }
  function onResumeFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => onResume(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function finish() {
    setErr(null);
    // 1) fly the form card off-screen (same transition as between steps) while the globe spins up
    //    and floods with waypoints as it "searches".
    setPhase("out");
    if (typeof window !== "undefined") window.dispatchEvent(new Event(FINISH_EVENT));
    window.setTimeout(() => setMode("finishing"), EXIT_MS); // globe alone once the card has left
    // Give the globe climax its moment even if the matching is fast.
    const climax = new Promise<void>((resolve) => setTimeout(resolve, 2900));

    let finalTags: string[] = [...selected];
    let nicheSlugs: string[] = [];
    // Whether the search got saved to the student's account — if so, the "see my matches" links can
    // stay clean (`/match` reads interests/grade/age from the account); if not (signed out / error),
    // we fall back to carrying the search in the URL so the feed still renders.
    let profileSaved = false;
    try {
      const { tags, archetypes } = await ensureVectors();
      const { student, result } = await classifyUser(
        {
          interestLabels: additional.trim() ? [additional.trim()] : [],
          explicitTagSlugs: [...selected],
          adjectives: adjList,
          resumeText: resumeText.trim() || undefined,
        },
        { embed: (t) => embedText(t), tagVectors: tags, archetypeVectors: archetypes },
      );
      finalTags = student.interestTagSlugs;
      // Persist to profile if signed in (the personality vector is written to the guarded column).
      try {
        const saveRes = await fetch("/api/profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tagSlugs: student.interestTagSlugs,
            grade,
            age,
            personalityVector: result.personality.vector,
            personalityArchetypes: result.personality.archetypes,
          }),
        });
        profileSaved = saveRes.ok;
      } catch {
        /* not signed in — fine */
      }
      // Niche free-text interests: embed server-side, then match to specific niche tags.
      if (additional.trim()) {
        try {
          const v = await embedText(additional.trim());
          const res = await fetch("/api/niche", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ vector: v }),
          });
          if (res.ok) nicheSlugs = ((await res.json()) as { tags: { slug: string }[] }).tags.map((t) => t.slug);
        } catch {
          /* niche match optional */
        }
      }
    } catch {
      /* model failed to load — fall back to the explicit interest picks */
    }

    // Params for the "see all matches" links. When the search saved to the account, only this
    // session's refinements (free-text niche, preferred kinds) ride in the URL — the interests and
    // grade/age come from the account, so the link stays clean. Otherwise carry the full search.
    const params = new URLSearchParams();
    if (nicheSlugs.length) params.set("niche", nicheSlugs.join(","));
    if (kinds.size) params.set("kinds", [...kinds].join(","));
    if (!profileSaved) {
      if (finalTags.length) params.set("tags", finalTags.join(","));
      if (grade != null) params.set("grade", String(grade));
      if (age != null) params.set("age", String(age));
    }
    setAllParams(params.toString());

    // The top 5, ranked server-side (personality fit included from the just-saved vector).
    let top: TopMatch[] = [];
    try {
      const res = await fetch("/api/match/top", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags: finalTags, niche: nicheSlugs, kinds: [...kinds], grade, age }),
      });
      if (res.ok) top = ((await res.json()) as { results: TopMatch[] }).results ?? [];
    } catch {
      /* show the empty-state fallback */
    }

    await climax; // let the globe finish its spin-up
    setResults(top);
    setMode("results");
  }

  const progress = ((step + 1) / STEPS.length) * 100;
  const canNext =
    step === 0
      ? true // optional — no preference means show everything, unranked by kind
      : step === 1
        ? broad.size > 0
        : step === 2
          ? selected.size > 0
          : step === 3
            ? adjList.length >= 3 && grade != null && age != null
            : true;

  // Whole-card transition: on "out" the glass card flies off-screen (revealing the globe); after a
  // hold it glides back in with the next step. Each phase drops a burst of waypoints on the globe.
  const cardClass = `${styles.card} ${phase === "out" ? styles.cardOut : styles.cardIn}`;
  const stageClass = styles.stage;
  const fireWaypoints = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("oppmatch:onboarding-step"));
  };
  function advance(dir: "next" | "back") {
    if (phase === "out") return; // already mid-transition
    const target = dir === "next" ? Math.min(STEPS.length - 1, step + 1) : Math.max(0, step - 1);
    if (target === step) return;
    setPhase("out"); // 1) card flies off-screen
    fireWaypoints();
    window.setTimeout(() => {
      // 2) card is off-screen: swap to the next step and drop more waypoints while the globe shows.
      setStep(target);
      fireWaypoints();
      window.scrollTo({ top: 0 });
      window.setTimeout(() => setPhase("in"), HOLD_MS); // 3) card glides back in
    }, EXIT_MS);
  }

  // Finishing: the card is gone and the globe alone does the "searching" — spinning up and flooding
  // with waypoints (see OnboardingGlobe). No text; just an empty spacer to hold the page height.
  if (mode === "finishing") {
    return <div className={styles.finishing} aria-hidden />;
  }

  // Results: the "rate your top 5" flashcard deck, right here over the (now gently-spinning) globe.
  if (mode === "results") {
    if (results.length === 0) {
      return (
        <div className={`${styles.card} ${styles.cardIn}`}>
          <div className={styles.results}>
            <h1 className={styles.resultsTitle}>Let&apos;s explore</h1>
            <p className={styles.resultsSub}>
              We couldn&apos;t pull a top 5 right now — browse everything that matches your interests.
            </p>
            <div className={styles.resultsActions}>
              <Link className={styles.primary} href={allParams ? `/match?${allParams}` : "/match"}>
                See my matches →
              </Link>
            </div>
          </div>
        </div>
      );
    }
    const opps = results.map((r) => ({
      slug: r.slug,
      title: r.title,
      kind: r.kind,
      tags: r.matchedTags,
      tagSlugs: r.tagSlugs,
      description: r.short_description,
      url: r.url,
      location: r.location ?? "—",
      cost: r.cost_type,
    }));
    return (
      <div className={styles.cardIn}>
        <RateDeck opps={opps} carry={allParams} />
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <div className={styles.wizard}>
      {/* Progress */}
      <div className={styles.progress}>
        <ol className={styles.stepList}>
          {STEPS.map((label, i) => (
            <li key={label} className={`${styles.stepItem} ${i === step ? styles.stepOn : ""} ${i < step ? styles.stepDone : ""}`}>
              <span className={styles.stepDot}>{i < step ? "✓" : i + 1}</span>
              <span className={styles.stepText}>{label}</span>
            </li>
          ))}
        </ol>
        <div className={styles.bar}>
          <div className={styles.barFill} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Step 0 — what kind of listing are they looking for */}
      {step === 0 && (
        <div className={stageClass}>
          <h2 className={styles.stageTitle}>What are you looking for?</h2>
          <p className={styles.stageSub}>
            Pick as many as you like — we&apos;ll prioritize these, but you&apos;ll still see
            everything else too. <span className={styles.optional}>(optional — skip to see it all)</span>
          </p>
          <div className={styles.kindGrid}>
            {KIND_OPTIONS.map((k) => (
              <button
                key={k.value}
                type="button"
                className={`${styles.kindCard} ${kinds.has(k.value) ? styles.kindCardSel : ""}`}
                aria-pressed={kinds.has(k.value)}
                onClick={() => toggleKind(k.value)}
              >
                <span className={`material-symbols-outlined ${styles.kindIcon}`}>{k.icon}</span>
                <span className={styles.kindLabel}>{k.label}</span>
                <span className={styles.kindDesc}>{k.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 1 — broad interests */}
      {step === 1 && (
        <div className={stageClass}>
          <h2 className={styles.stageTitle}>What are you into?</h2>
          <p className={styles.stageSub}>Tap the areas that spark your interest. Pick as many as you like.</p>
          <div className={styles.bubbles}>
            {domains.map((d, i) => (
              <span key={d} className={styles.bubbleWrap} style={floatStyle(i)}>
                <button
                  type="button"
                  className={`${styles.bubble} ${broad.has(d) ? styles.sel : ""}`}
                  style={colorStyle(domainColor.get(d)!)}
                  aria-pressed={broad.has(d)}
                  onClick={() => toggle(broad, setBroad, d)}
                >
                  {d}
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 — specific interests */}
      {step === 2 && (
        <div className={stageClass}>
          <h2 className={styles.stageTitle}>Get specific</h2>
          <p className={styles.stageSub}>Which of these fit best? Tap the ones you&apos;d actually want.</p>
          <div className={styles.bubbles}>
            {specificTags.map((t, i) => (
              <span key={t.slug} className={styles.bubbleWrap} style={floatStyle(i)}>
                <button
                  type="button"
                  className={`${styles.bubble} ${styles.small} ${selected.has(t.slug) ? styles.sel : ""}`}
                  style={colorStyle(domainColor.get(t.domain) ?? PALETTE[0])}
                  aria-pressed={selected.has(t.slug)}
                  onClick={() => toggle(selected, setSelected, t.slug)}
                >
                  {t.label}
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 — about you */}
      {step === 3 && (
        <div className={stageClass}>
          <h2 className={styles.stageTitle}>A bit about you</h2>
          <p className={styles.stageSub}>Anything else you&apos;re into, plus a few words that describe you.</p>

          <label className={styles.formLabel}>
            Any other interests? <span className={styles.optional}>(optional)</span>
            <textarea
              className={styles.textarea}
              rows={2}
              placeholder="e.g. urban gardening, game design, marine conservation…"
              value={additional}
              onChange={(e) => setAdditional(e.target.value)}
            />
          </label>

          <label className={styles.formLabel}>
            Describe yourself in a few words <span className={styles.req}>(at least 3)</span>
            <input
              className={styles.input}
              placeholder="curious, creative, driven, competitive…"
              value={adjectives}
              onChange={(e) => setAdjectives(e.target.value)}
              onFocus={() => warmUpEmbedder()}
            />
            <span className={styles.hint}>
              {adjList.length}/3 — these stay private and help us rank your matches.
            </span>
          </label>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              Grade <span className={styles.req}>(required)</span>
              <select
                className={styles.input}
                value={grade ?? ""}
                onChange={(e) => setGrade(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select…</option>
                <option value="9">9th</option>
                <option value="10">10th</option>
                <option value="11">11th</option>
                <option value="12">12th</option>
              </select>
            </label>
            <label className={styles.formLabel}>
              Age <span className={styles.req}>(required)</span>
              <input
                className={styles.input}
                type="number"
                min={12}
                max={20}
                placeholder="16"
                value={age ?? ""}
                onChange={(e) => setAge(e.target.value ? Number(e.target.value) : null)}
              />
            </label>
          </div>
        </div>
      )}

      {/* Step 4 — resume */}
      {step === 4 && (
        <div className={stageClass}>
          <h2 className={styles.stageTitle}>Add a resume?</h2>
          <p className={styles.stageSub}>
            Optional. Personal info (emails, phone, address) is stripped on your device first; only
            the cleaned text is sent to our server to match, and it&apos;s never stored. (.txt for now.)
          </p>
          <textarea
            className={styles.textarea}
            rows={5}
            placeholder="Paste your resume here…"
            value={resumeText}
            onChange={(e) => onResume(e.target.value)}
            onFocus={() => warmUpEmbedder()}
          />
          <div className={styles.orDivider}>
            <span>or upload a file</span>
          </div>
          <div
            className={`${styles.dropzone} ${dragOver ? styles.dropOver : ""} ${fileName ? styles.dropDone : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onResumeFile(e.dataTransfer.files?.[0]);
            }}
          >
            <span className={`material-symbols-outlined ${styles.dropIcon}`}>
              {fileName ? "task_alt" : "upload_file"}
            </span>
            <div className={styles.dropText}>
              {fileName ? (
                <>
                  <strong>{fileName}</strong>
                  <span className={styles.dropSub}>Uploaded — click to replace</span>
                </>
              ) : (
                <>
                  <strong>Click to upload or drag &amp; drop</strong>
                  <span className={styles.dropSub}>.txt file</span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              className={styles.hiddenFile}
              type="file"
              accept=".txt,text/plain"
              onChange={(e) => onResumeFile(e.target.files?.[0])}
            />
          </div>
          {stripped.length > 0 && (
            <div className={styles.stripped}>
              <strong>🔒 Removed before processing:</strong>
              {stripped.map((s, i) => (
                <span key={i} className={styles.strip}>
                  {s.kind}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {err && <p className={styles.err}>{err}</p>}

      {/* Nav */}
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => advance("back")}
          disabled={step === 0 || phase === "out"}
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className={styles.primary}
            onClick={() => advance("next")}
            disabled={!canNext || phase === "out"}
          >
            Continue
          </button>
        ) : (
          <button type="button" className={styles.primary} onClick={finish} disabled={phase === "out"}>
            See my matches →
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
