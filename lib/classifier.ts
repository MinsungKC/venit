/**
 * Pure, deterministic on-device classifier logic (BUILD_PROMPT §3). Every function here takes
 * already-embedded vectors as input and never touches the model, so it unit-tests without
 * loading MiniLM and is dimension-agnostic (tests use small synthetic vectors).
 *
 * GUARDRAIL §0.1: personality is SECRET. `classifyPersonality` produces a `PersonalityResult`
 * that must be routed to the server; the only student-facing shape is `toStudentPayload`, which
 * by construction carries interest tags + custom requests and NO personality data.
 */
import { cosine } from "./vec";
import type {
  ArchetypeVector,
  ClassifierResult,
  CustomTagRequest,
  PersonalityResult,
  TagVector,
} from "./match-types";

/** L2-normalize a vector (returns a copy; zero vectors pass through unchanged). */
function normalize(v: number[]): number[] {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm === 0) return v.slice();
  return v.map((x) => x / norm);
}

/**
 * Assign interest tags to a user vector: every tag scoring ≥ `threshold` by cosine, keeping the
 * top `topK` by score, with `explicit` picks always merged in (explicit selections win over the
 * similarity cutoff) and the result deduped. Order: explicit picks first, then similarity order.
 */
export function assignInterestTags(
  userVector: number[],
  tags: TagVector[],
  opts: { threshold?: number; topK?: number; explicit?: string[] } = {},
): string[] {
  const { threshold = 0.3, topK = 8, explicit = [] } = opts;

  const scored = tags
    .map((t) => ({ slug: t.slug, score: cosine(userVector, t.vector) }))
    .filter((t) => t.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((t) => t.slug);

  // Explicit picks always win (§4: interest tags the student chose are never dropped).
  const merged = [...explicit, ...scored];
  return [...new Set(merged)];
}

/**
 * Snap a free-text niche to the nearest existing tag, or request a new custom tag. If the best
 * cosine match is ≥ `threshold` we snap to that tag's slug; otherwise we surface a
 * `CustomTagRequest` carrying the text + vector so an org/admin can later canonicalize it.
 */
export function snapOrCreateNiche(
  text: string,
  nicheVector: number[],
  tags: TagVector[],
  threshold = 0.3,
): { snappedSlug: string } | { customRequest: CustomTagRequest } {
  let best: { slug: string; score: number } | null = null;
  for (const t of tags) {
    const score = cosine(nicheVector, t.vector);
    if (!best || score > best.score) best = { slug: t.slug, score };
  }

  if (best && best.score >= threshold) return { snappedSlug: best.slug };
  return { customRequest: { text, vector: nicheVector } };
}

/**
 * Classify a personality (adjective) vector into a SECRET `PersonalityResult`: cosine vs each
 * archetype, softmax the similarities into weights, blend the archetype vectors by those weights
 * (then L2-normalize) for `vector`, and report the top-N archetype slugs by weight. §0.1: this
 * output never reaches the student.
 */
export function classifyPersonality(
  adjectiveVector: number[],
  archetypes: ArchetypeVector[],
  opts: { topN?: number; temperature?: number } = {},
): PersonalityResult {
  const { topN = 3, temperature = 0.1 } = opts;

  const sims = archetypes.map((a) => cosine(adjectiveVector, a.vector));

  // Softmax over similarities (temperature sharpens the blend). Subtract the max for stability.
  const max = Math.max(...sims);
  const exps = sims.map((s) => Math.exp((s - max) / temperature));
  const sum = exps.reduce((acc, e) => acc + e, 0);
  const weights = exps.map((e) => e / sum);

  // Weighted mean of the archetype vectors → soft blend, then L2-normalize.
  const dim = archetypes.length > 0 ? archetypes[0].vector.length : 0;
  const blend = new Array<number>(dim).fill(0);
  archetypes.forEach((a, i) => {
    const w = weights[i];
    for (let d = 0; d < dim; d++) blend[d] += w * a.vector[d];
  });
  const vector = normalize(blend);

  const topArchetypes = archetypes
    .map((a, i) => ({ slug: a.slug, weight: weights[i] }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN)
    .map((a) => a.slug);

  return { vector, archetypes: topArchetypes };
}

/**
 * Thin composer assembling the full classifier output from its already-computed parts. `niches`
 * are the resolved outputs of `snapOrCreateNiche`: snapped slugs join the interest tags, custom
 * requests are surfaced for canonicalization.
 */
export function buildClassifierResult(args: {
  interestTagSlugs: string[];
  niches?: ({ snappedSlug: string } | { customRequest: CustomTagRequest })[];
  personality: PersonalityResult;
}): ClassifierResult {
  const { interestTagSlugs, niches = [], personality } = args;

  const snapped: string[] = [];
  const customTagRequests: CustomTagRequest[] = [];
  for (const n of niches) {
    if ("snappedSlug" in n) snapped.push(n.snappedSlug);
    else customTagRequests.push(n.customRequest);
  }

  return {
    interestTagSlugs: [...new Set([...interestTagSlugs, ...snapped])],
    customTagRequests,
    personality,
  };
}

/**
 * The ONLY shape allowed to reach a student client (§0.1). Deliberately reconstructs a fresh
 * object with just the student-facing fields so no personality data can ride along — do not
 * spread `result` here.
 */
export function toStudentPayload(result: ClassifierResult): {
  interestTagSlugs: string[];
  customTagRequests: CustomTagRequest[];
} {
  return {
    interestTagSlugs: result.interestTagSlugs,
    customTagRequests: result.customTagRequests,
  };
}
