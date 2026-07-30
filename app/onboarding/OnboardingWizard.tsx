"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import type { MatchTag } from "@/lib/match-data";
import type { ArchetypeVector, TagVector } from "@/lib/match-types";
import { classifyUser } from "@/lib/user-classifier";
import { embedText, warmUpEmbedder, type LoadProgress } from "@/lib/embeddings-browser";
import { scrubPII, type StrippedPII } from "@/lib/pii";
import styles from "./onboarding.module.css";

/**
 * Onboarding wizard (BUILD_PROMPT §6). Four playful steps with a progress bar:
 *  1. Broad interests  — pop the domain bubbles.
 *  2. Specific interests — bubbles for the tags inside the chosen domains.
 *  3. About you — optional extra interests + a few required adjectives (feed the SECRET personality).
 *  4. Resume — optional, parsed & PII-scrubbed on-device (§0.2/§0.3).
 * On finish we classify on-device, save the profile if signed in, and land on /match.
 */
const STEPS = ["Interests", "Specifics", "About you", "Resume"] as const;

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
  const [broad, setBroad] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [additional, setAdditional] = useState("");
  const [adjectives, setAdjectives] = useState("");
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
      // Land on the rating deck to fine-tune before showing everything.
      router.push(`/refine?${params.toString()}`);
    } catch {
      // Model failed to load — still continue with the explicit picks.
      const params = new URLSearchParams();
      if (selected.size) params.set("tags", [...selected].join(","));
      router.push(`/refine?${params.toString()}`);
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100;
  const canNext =
    step === 0 ? broad.size > 0 : step === 1 ? selected.size > 0 : step === 2 ? adjList.length >= 3 : true;

  if (busy) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p className={styles.loadMsg}>{load?.msg}</p>
        {load && load.pct > 0 && (
          <div className={styles.loadBar}>
            <div className={styles.loadFill} style={{ width: `${load.pct}%` }} />
          </div>
        )}
        <p className={styles.loadNote}>Running on your device — your info never leaves the browser.</p>
      </div>
    );
  }

  return (
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

      {/* Step 0 — broad interests */}
      {step === 0 && (
        <div className={styles.stage}>
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

      {/* Step 1 — specific interests */}
      {step === 1 && (
        <div className={styles.stage}>
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

      {/* Step 2 — about you */}
      {step === 2 && (
        <div className={styles.stage}>
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
        </div>
      )}

      {/* Step 3 — resume */}
      {step === 3 && (
        <div className={styles.stage}>
          <h2 className={styles.stageTitle}>Add a resume?</h2>
          <p className={styles.stageSub}>
            Optional. It&apos;s read on your device, scrubbed of personal info, and never uploaded. (.txt for now.)
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
        <button type="button" className={styles.ghost} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className={styles.primary} onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Continue
          </button>
        ) : (
          <button type="button" className={styles.primary} onClick={finish}>
            See my matches →
          </button>
        )}
      </div>
    </div>
  );
}
