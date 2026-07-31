/**
 * Shared type contract for the on-device classifier (BUILD_PROMPT §3) and the matching /
 * ranking engine (§5). Kept dependency-free and DB-agnostic so both the browser classifier
 * and server-side matching import the same shapes.
 *
 * GUARDRAIL §0.1 is encoded in the types: personality data lives only on the `*Secret`
 * fields / `PersonalityResult`, and `MatchResult` (the student-facing shape) has NO
 * personality field at all. Anything sent to a student client must be a `MatchResult`.
 */
import type { CostType, ListingKind, ListingStatus } from "./mapping";

/** A precomputed interest-tag vector shipped to the client (public/data/tag-vectors.json). */
export interface TagVector {
  slug: string;
  label: string;
  domain: string;
  vector: number[];
}

/** A precomputed archetype vector (public/data/archetype-vectors.json). Ranking input only. */
export interface ArchetypeVector {
  slug: string;
  label: string;
  vector: number[];
}

/** SECRET personality output of the classifier — sent to the server for storage, never rendered. */
export interface PersonalityResult {
  /** 768-dim soft blend over the 10 archetype vectors. */
  vector: number[];
  /** Top-N archetype slugs (also secret; never shown to the student). */
  archetypes: string[];
}

/** A free-text niche interest that didn't snap to an existing tag (BUILD_PROMPT §3 step 4). */
export interface CustomTagRequest {
  text: string;
  vector: number[];
}

/**
 * Full result of the on-device classifier. Only `interestTagSlugs` (and custom requests) are
 * student-facing; `personality` must be routed to secret storage and never echoed back.
 */
export interface ClassifierResult {
  interestTagSlugs: string[];
  customTagRequests: CustomTagRequest[];
  personality: PersonalityResult;
}

/** The student profile the matcher reads. `personalityVector` is SECRET (server-side only). */
export interface MatchProfile {
  age: number | null;
  grade: number | null;
  lat: number | null;
  lng: number | null;
  interestTagSlugs: string[];
  /** SECRET — used only for ranking, never leaves the server. */
  personalityVector: number[] | null;
}

/** A listing as the matcher sees it. `desiredPersonalityVector` is SECRET (ranking only). */
export interface MatchListing {
  id: string;
  kind: ListingKind;
  status: ListingStatus;
  tagSlugs: string[];
  ageMin: number | null;
  ageMax: number | null;
  gradeMin: number | null;
  gradeMax: number | null;
  lat: number | null;
  lng: number | null;
  isRemote: boolean;
  costType: CostType;
  costAmount: number | null;
  /** For research_lab: max distance (km) a student may be from the lab. null = no limit set. */
  radiusKm: number | null;
  /** Whether the org is actively recruiting — a small positive ranking nudge (never a filter). */
  isRecruiting?: boolean;
  /**
   * Whether this opportunity is genuinely open to high-schoolers (explicit HS grade eligibility, a
   * hand-curated HS program, or a recruiting program/camp/volunteer role) vs. the large pile of
   * adult jobs and unknown-HS-policy research groups. A ranking boost so the ~hundreds of real
   * teen opportunities aren't buried under ~15k adult/unknown listings. Never a hard filter (§0.4).
   */
  hsAccessible?: boolean;
  /** SECRET — mean of the listing's desired-archetype vectors; used only for the fit score. */
  desiredPersonalityVector: number[] | null;
}

export type SortAxis = "fit" | "distance" | "cost";

/** Coarse, student-safe fit label. Never the archetype names or the numeric score (§0.1). */
export type FitLabel = "Great fit" | "Good fit" | "Fair fit" | null;

/**
 * A single student-facing match. By construction this shape carries NO personality field —
 * only the coarse `fitLabel`. Any API returning matches must return this type.
 */
export interface MatchResult {
  id: string;
  /** The shared interest tags — the "why you're seeing this" (§7). */
  matchedTagSlugs: string[];
  fitLabel: FitLabel;
  /** Distance to the listing; null means Remote or unknown. */
  distanceKm: number | null;
  costType: CostType;
  costAmount: number | null;
}
