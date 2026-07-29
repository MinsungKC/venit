/**
 * Client-side orchestration for the on-device user classifier (BUILD_PROMPT §3). Ties together
 * the PII scrub, the embedding step, and the pure `lib/classifier.ts` functions into one call.
 *
 * The embedding function is INJECTED (`deps.embed`), so this module never imports the model and
 * unit-tests with a fake embedder. In the browser the app passes a MiniLM-backed `embed`; the
 * reference vectors (`tagVectors`, `archetypeVectors`) are the committed public/data JSON.
 *
 * GUARDRAIL §0.1/§0.2/§0.3: the raw resume is scrubbed and only its cleaned text is embedded
 * (never uploaded); the returned `student` payload carries only interest tags, while the secret
 * personality lives on `result.personality` for server storage and is never surfaced.
 */
import { scrubPII, type StrippedPII } from "./pii";
import {
  assignInterestTags,
  buildClassifierResult,
  classifyPersonality,
  snapOrCreateNiche,
  toStudentPayload,
} from "./classifier";
import type {
  ArchetypeVector,
  ClassifierResult,
  CustomTagRequest,
  TagVector,
} from "./match-types";

export interface UserClassifierInput {
  /** Human labels the student picked (embedded as free text to widen tag recall). */
  interestLabels?: string[];
  /** Tag slugs the student explicitly selected — always kept, even below threshold (§4). */
  explicitTagSlugs?: string[];
  /** Free-text niche interests; each snaps to a tag or becomes a custom request. */
  nicheTexts?: string[];
  /** Personality adjectives — the only input to the SECRET personality vector. */
  adjectives?: string[];
  /** Optional raw resume text; scrubbed here and embedded, never persisted. */
  resumeText?: string;
}

export interface UserClassifierDeps {
  embed: (text: string) => Promise<number[]>;
  tagVectors: TagVector[];
  archetypeVectors: ArchetypeVector[];
  assignOpts?: { threshold?: number; topK?: number };
  personalityOpts?: { topN?: number; temperature?: number };
}

export interface UserClassification {
  /** Full result including the SECRET personality — send to the server, never render. */
  result: ClassifierResult;
  /** The ONLY shape safe to keep client-side / show the student. */
  student: { interestTagSlugs: string[]; customTagRequests: CustomTagRequest[] };
  /** What the PII scrub removed from the resume, to show the user (§0.3). */
  piiStripped: StrippedPII[];
}

/** Zero vector matching the archetype dimension — the neutral personality when no adjectives given. */
function zeroVector(deps: UserClassifierDeps): number[] {
  const dim = deps.archetypeVectors[0]?.vector.length ?? 0;
  return new Array<number>(dim).fill(0);
}

/**
 * Run the full on-device classification. Deterministic given a deterministic `embed`; performs
 * no I/O of its own beyond the injected embedder.
 */
export async function classifyUser(
  input: UserClassifierInput,
  deps: UserClassifierDeps,
): Promise<UserClassification> {
  const { cleaned, stripped } = scrubPII(input.resumeText ?? "");

  // Interest document = picked labels + scrubbed resume. Embedded only if non-empty.
  const interestDoc = [...(input.interestLabels ?? []), cleaned]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(". ");

  const interestTagSlugs = interestDoc
    ? assignInterestTags(await deps.embed(interestDoc), deps.tagVectors, {
        ...deps.assignOpts,
        explicit: input.explicitTagSlugs ?? [],
      })
    : [...new Set(input.explicitTagSlugs ?? [])];

  // Free-text niches: snap to nearest tag or surface a custom request.
  const niches: ({ snappedSlug: string } | { customRequest: CustomTagRequest })[] = [];
  for (const text of input.nicheTexts ?? []) {
    const t = text.trim();
    if (!t) continue;
    niches.push(snapOrCreateNiche(t, await deps.embed(t), deps.tagVectors));
  }

  // Personality: embed the adjectives (only if any) into the SECRET blend.
  const adjectives = (input.adjectives ?? []).map((a) => a.trim()).filter(Boolean);
  const personality = adjectives.length
    ? classifyPersonality(
        await deps.embed(adjectives.join(", ")),
        deps.archetypeVectors,
        deps.personalityOpts,
      )
    : { vector: zeroVector(deps), archetypes: [] };

  const result = buildClassifierResult({ interestTagSlugs, niches, personality });
  return { result, student: toStudentPayload(result), piiStripped: stripped };
}
