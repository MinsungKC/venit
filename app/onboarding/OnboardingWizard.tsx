"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import type { MatchTag } from "@/lib/match-data";
import type { ArchetypeVector, TagVector } from "@/lib/match-types";
import type { ListingKind } from "@/lib/mapping";
import { classifyUser } from "@/lib/user-classifier";
import { embedText, warmUpEmbedder, type LoadProgress } from "@/lib/embed-client";
import { scrubPII, type StrippedPII } from "@/lib/pii";
import styles from "./onboarding.module.css";

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
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [kinds, setKinds] = useState<Set<ListingKind>>(new Set());
  const [broad, setBroad] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [additional, setAdditional] = useState("");
  const [adjectives, setAdjectives] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [stripped, setStripped] = useState<StrippedPII[]>([]);
  const [busy, setBusy] = useState(false);
  const [load, setLoad] = useState<{ pct: number; msg: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const vectorsRef = useRef<{ tags: TagVector[]; archetypes: ArchetypeVector[] } | null>(null);

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

  const onProgress = (p: LoadProgress) => {
    if (typeof p.progress === "number") setLoad({ pct: Math.round(p.progress), msg: `Warming up… ${Math.round(p.progress)}%` });
  };

  function onResume(text: string) {
    setResumeText(text);
    setStripped(text.trim() ? scrubPII(text).stripped : []);
  }
  function onResumeFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onResume(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function finish() {
    setBusy(true);
    setErr(null);
    setLoad({ pct: 0, msg: "Finding your matches…" });
    try {
      const { tags, archetypes } = await ensureVectors();
      const { student, result } = await classifyUser(
        {
          interestLabels: additional.trim() ? [additional.trim()] : [],
          explicitTagSlugs: [...selected],
          adjectives: adjList,
          resumeText: resumeText.trim() || undefined,
        },
        { embed: (t) => embedText(t, onProgress), tagVectors: tags, archetypeVectors: archetypes },
      );
      // Persist to profile if signed in (the personality vector is written to the guarded column).
      try {
        await fetch("/api/profile", {
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
      } catch {
        /* not signed in — fine */
      }
      // Niche free-text interests: embed on-device, then match to specific niche tags server-side.
      let nicheSlugs: string[] = [];
      if (additional.trim()) {
        try {
          const v = await embedText(additional.trim());
          const res = await fetch("/api/niche", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ vector: v }),
          });
          if (res.ok) {
            const d = (await res.json()) as { tags: { slug: string }[] };
            nicheSlugs = d.tags.map((t) => t.slug);
          }
        } catch {
          /* niche match optional */
        }
      }

      const params = new URLSearchParams();
      if (student.interestTagSlugs.length) params.set("tags", student.interestTagSlugs.join(","));
      if (nicheSlugs.length) params.set("niche", nicheSlugs.join(","));
      if (kinds.size) params.set("kinds", [...kinds].join(","));
      if (grade != null) params.set("grade", String(grade));
      if (age != null) params.set("age", String(age));
      // Land on the rating deck to fine-tune before showing everything.
      router.push(`/refine?${params.toString()}`);
    } catch {
      // Model failed to load — still continue with the explicit picks.
      const params = new URLSearchParams();
      if (selected.size) params.set("tags", [...selected].join(","));
      if (kinds.size) params.set("kinds", [...kinds].join(","));
      if (grade != null) params.set("grade", String(grade));
      if (age != null) params.set("age", String(age));
      router.push(`/refine?${params.toString()}`);
    }
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

  if (busy) {
    return (
      <div className={`${styles.card} ${styles.cardIn}`}>
        <div className={styles.loading}>
        <div className={styles.spinner} />
        <p className={styles.loadMsg}>{load?.msg}</p>
        {load && load.pct > 0 && (
          <div className={styles.loadBar}>
            <div className={styles.loadFill} style={{ width: `${load.pct}%` }} />
          </div>
        )}
        <p className={styles.loadNote}>
          Personal info is scrubbed on your device first; only the cleaned text is matched on our
          server, and it&apos;s never stored.
        </p>
        </div>
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
              onFocus={() => warmUpEmbedder(onProgress)}
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
            onFocus={() => warmUpEmbedder(onProgress)}
          />
          <input className={styles.file} type="file" accept=".txt,text/plain" onChange={(e) => onResumeFile(e.target.files?.[0])} />
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
