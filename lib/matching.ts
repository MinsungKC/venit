/**
 * Matching / ranking engine (BUILD_PROMPT §5). Pure, deterministic functions: given a
 * student `MatchProfile` and the candidate `MatchListing`s, filter to the eligible set and
 * rank it. No I/O, no DB, no per-request AI (§0.6 / §0.7).
 *
 * GUARDRAIL §0.1 — personality is SECRET. `personalityVector` / `desiredPersonalityVector`
 * are read ONLY to compute a coarse `fitLabel`; the raw cosine score, the vectors, and any
 * archetype names never appear in the returned `MatchResult`. §0.4: every returned listing
 * shares ≥1 interest tag (personality never gates, only sorts). §0.5: a research_lab also
 * needs a location match unless remote. §0.6: age/grade are hard filters, never ranking.
 *
 * Default ranking is a composite `relevanceScore`: rarity-weighted interest-tag overlap
 * (`tagOverlapScore`) modulated by how much of the student's interest set a listing covers
 * (`coverageScore`) and how focused the listing is on those interests vs. tag-spam
 * (`focusScore`), with personality fit and an "actively recruiting" nudge folded in as
 * secondary terms. Tags remain the primary signal (the only §0.4 hard requirement); personality
 * only refines the order within comparable tag relevance, and never gates (§0.4).
 */
import { cosine } from "./vec";
import type { ListingKind } from "./mapping";
import type {
  FitLabel,
  MatchListing,
  MatchProfile,
  MatchResult,
  SortAxis,
} from "./match-types";

/** Default research-lab reach when a listing sets no explicit radius (§0.5). */
const DEFAULT_LAB_RADIUS_KM = 80;

/** Fit buckets over the cosine score. Kept coarse on purpose — the number never leaks (§0.1). */
const GREAT_FIT_MIN = 0.66;
const GOOD_FIT_MIN = 0.33;

/** Great-circle distance between two lat/lng points, in kilometers. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371; // mean Earth radius (km)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The interest tags a profile and listing share (listing order preserved). */
function sharedTags(profile: MatchProfile, listing: MatchListing): string[] {
  const wanted = new Set(profile.interestTagSlugs);
  return listing.tagSlugs.filter((slug) => wanted.has(slug));
}

/**
 * How many of `listings` carry each tag slug — the denominator for how "rare" (and so how
 * informative) a shared tag is. Computed once per `match()` call over the full candidate pool
 * passed in, not the profile-specific eligible subset, so rarity reflects the actual catalog.
 */
function tagDocumentFrequency(listings: MatchListing[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const l of listings) {
    for (const slug of new Set(l.tagSlugs)) {
      freq.set(slug, (freq.get(slug) ?? 0) + 1);
    }
  }
  return freq;
}

/**
 * Weighted interest-tag overlap: sum of inverse-document-frequency over the tags a profile and
 * listing share, so matching on a rare/niche tag (e.g. "Astrobiology") counts for more than
 * matching on a broad one (e.g. "Research") that most listings carry. `log(1 + N/df)` keeps the
 * weight positive even for a tag on every listing, and strictly increasing as a tag gets rarer.
 *
 * This is the PRIMARY ranking signal in the default blend: interest tags are the only §0.4 hard
 * requirement (personality is explicitly secondary — a coarse label only), so how well a
 * listing's tags actually overlap the student's stated interests should outrank personality fit,
 * not the other way around.
 */
export function tagOverlapScore(
  profile: MatchProfile,
  listing: MatchListing,
  docFreq: Map<string, number>,
  totalListings: number,
): number {
  let score = 0;
  for (const slug of new Set(sharedTags(profile, listing))) {
    const df = docFreq.get(slug) ?? 1;
    const idf = Math.log(1 + totalListings / df);
    // Engagement affinity (lib/adaptive): a tag the student engages with more counts for more.
    // Absent → 1.0 (neutral), so this is a no-op for callers that don't pass weights.
    const weight = profile.tagWeights?.[slug] ?? 1;
    score += idf * weight;
  }
  return score;
}

/**
 * Breadth: the fraction of the student's DISTINCT interests this listing covers (0..1]. Rewards a
 * listing that speaks to several of the student's interests over one that hits a single interest
 * many times, so the feed leans toward well-rounded matches rather than one-note ones.
 */
export function coverageScore(profile: MatchProfile, listing: MatchListing): number {
  const picked = new Set(profile.interestTagSlugs);
  if (picked.size === 0) return 0;
  const shared = new Set(sharedTags(profile, listing));
  return shared.size / picked.size;
}

/**
 * Precision / anti-tag-spam: of the listing's OWN tags, the fraction that are ones the student
 * wants (0..1]. A company tagged with 25 unrelated things that merely happens to include "ai"
 * scores low here; a company that IS an AI company scores high. This is what stops broadly-tagged
 * listings from dominating and making every feed look the same ("too broad/samey").
 */
export function focusScore(profile: MatchProfile, listing: MatchListing): number {
  const total = new Set(listing.tagSlugs).size;
  if (total === 0) return 0;
  const shared = new Set(sharedTags(profile, listing)).size;
  return shared / total;
}

/** How much personality fit can add on top of tag relevance. Kept modest so tags stay primary. */
const FIT_WEIGHT = 1.5;
/** Small additive nudge for listings that are actively recruiting (more actionable). */
const RECRUIT_BONUS = 0.5;
/**
 * Boost for opportunities genuinely open to high-schoolers. Deliberately strong — the catalog is
 * ~97% adult jobs and unknown-HS-policy research groups, so without this a broadly-tagged company
 * outranks a perfectly-relevant HS summer program. Applied on top of tag relevance, so among
 * HS-accessible listings tag fit still decides the order; it only lifts the accessible ones as a
 * group above the adult/unknown pile. Never a hard filter (§0.4) — everything stays discoverable.
 */
const HS_ACCESS_BONUS = 2.5;

/**
 * The default-blend relevance of a listing to a student — higher is better. Composite of:
 *  - `tagOverlapScore` — rarity-weighted mass of shared interest tags (the PRIMARY signal).
 *  - `coverageScore`   — breadth over the student's distinct interests (multiplier 0.6–1.0).
 *  - `focusScore`      — precision vs. tag-spam (multiplier 0.5–1.0).
 *  - personality fit   — a secondary additive term (only when both vectors exist, §0.1).
 *  - recruiting nudge  — a small additive bonus.
 *  - HS-accessible boost — lifts opportunities genuinely open to high-schoolers above the adult pile.
 * Zero when nothing overlaps (the listing wouldn't pass the §0.4 hard filter anyway). The raw
 * value is an internal ranking key only; it is never surfaced to the student.
 */
export function relevanceScore(
  profile: MatchProfile,
  listing: MatchListing,
  docFreq: Map<string, number>,
  totalListings: number,
): number {
  const overlap = tagOverlapScore(profile, listing, docFreq, totalListings);
  if (overlap <= 0) return 0;
  const coverage = coverageScore(profile, listing);
  const focus = focusScore(profile, listing);
  let score = overlap * (0.6 + 0.4 * coverage) * (0.5 + 0.5 * focus);
  const fit = fitScore(profile, listing);
  if (fit != null && fit > 0) score += FIT_WEIGHT * fit;
  if (listing.isRecruiting) score += RECRUIT_BONUS;
  if (listing.hsAccessible) score += HS_ACCESS_BONUS;
  return score;
}

/**
 * Every hard gate a listing must clear to be shown at all. Personality is NOT here — it only
 * sorts (§0.4). Missing optional bounds are permissive: absent age/grade limits never exclude,
 * and an unknown student age/grade is not held against a listing that does set a bound.
 */
export function passesHardFilters(profile: MatchProfile, listing: MatchListing): boolean {
  // Only approved listings are eligible.
  if (listing.status !== "approved") return false;

  // §0.4 — at least one shared interest tag.
  if (sharedTags(profile, listing).length === 0) return false;

  // §0.6 — age is a hard filter (only when both the bound and the student's age are known).
  if (profile.age != null) {
    if (listing.ageMin != null && profile.age < listing.ageMin) return false;
    if (listing.ageMax != null && profile.age > listing.ageMax) return false;
  }

  // §0.6 — grade is a hard filter (same missing-bound permissiveness).
  if (profile.grade != null) {
    if (listing.gradeMin != null && profile.grade < listing.gradeMin) return false;
    if (listing.gradeMax != null && profile.grade > listing.gradeMax) return false;
  }

  // §0.5 — an in-person research lab must be within reach of the student.
  if (listing.kind === "research_lab" && !listing.isRemote) {
    if (profile.lat == null || profile.lng == null || listing.lat == null || listing.lng == null) {
      return false; // no way to prove proximity → not a match
    }
    const radius = listing.radiusKm ?? DEFAULT_LAB_RADIUS_KM;
    const dist = haversineKm(profile.lat, profile.lng, listing.lat, listing.lng);
    if (dist > radius) return false;
  }

  return true;
}

/**
 * Coarse personality-fit label from the cosine of the two secret vectors (§0.1). Returns null
 * when either vector is absent. The raw score is intentionally discarded here so it can never
 * be surfaced.
 */
export function fitLabel(profile: MatchProfile, listing: MatchListing): FitLabel {
  const score = fitScore(profile, listing);
  if (score == null) return null;
  if (score >= GREAT_FIT_MIN) return "Great fit";
  if (score >= GOOD_FIT_MIN) return "Good fit";
  return "Fair fit";
}

/**
 * SECRET internal ranking signal — the raw cosine, or null when a vector is missing. Not
 * exported: it must never reach a student-facing surface (§0.1).
 */
function fitScore(profile: MatchProfile, listing: MatchListing): number | null {
  const a = profile.personalityVector;
  const b = listing.desiredPersonalityVector;
  if (!a || !b) return null;
  return cosine(a, b);
}

/**
 * Distance surfaced to the student: null for a remote listing (rendered as "Remote") and null
 * when coordinates are unknown; otherwise the great-circle kilometers. For sorting, remote is
 * treated as nearest (see `sortDistance`).
 */
export function distanceKm(profile: MatchProfile, listing: MatchListing): number | null {
  if (listing.isRemote) return null;
  if (profile.lat == null || profile.lng == null || listing.lat == null || listing.lng == null) {
    return null;
  }
  return haversineKm(profile.lat, profile.lng, listing.lat, listing.lng);
}

/** Distance as a sort key: remote is nearest (0), unknown sorts last (Infinity). */
function sortDistance(profile: MatchProfile, listing: MatchListing): number {
  if (listing.isRemote) return 0;
  const d = distanceKm(profile, listing);
  return d == null ? Infinity : d;
}

/**
 * Cost ordering key (ascending = cheapest first): free < stipend < paid, then by amount, with
 * an unknown cost type or unknown amount sorting last within its band.
 */
export function costRank(listing: MatchListing): number {
  const TYPE_ORDER: Record<MatchListing["costType"], number> = {
    free: 0,
    stipend: 1,
    paid: 2,
    unknown: 3,
  };
  const BAND = 1e12; // wide enough that amount never spills into the next cost-type band
  // null amount sorts last within its band; clamp so a huge amount can't cross bands.
  const amountKey = listing.costAmount == null ? BAND - 1 : Math.min(listing.costAmount, BAND - 1);
  return TYPE_ORDER[listing.costType] * BAND + amountKey;
}

/** Fit as a sort key (descending fit = better): missing fit sorts last. */
function sortFit(profile: MatchProfile, listing: MatchListing): number {
  const s = fitScore(profile, listing);
  return s == null ? -Infinity : s;
}

/**
 * Filter to eligible listings, rank them, and project each to a student-safe `MatchResult`.
 *
 * Sort axes:
 *  - default ("blend"): composite `relevanceScore` desc (overlap × coverage × focus + fit +
 *    recruiting), then id — the main relevance ranking students see.
 *  - "fit":      fit desc, then tag overlap desc.
 *  - "distance": distance asc (remote nearest), then tag overlap desc.
 *  - "cost":     cost asc, then tag overlap desc.
 * Listing id is the final tiebreaker everywhere, so the order is fully deterministic.
 *
 * Not-recruiting listings are NOT filtered out — they remain matchable by tag (§0.4).
 */
export function match(
  profile: MatchProfile,
  listings: MatchListing[],
  opts?: { sort?: SortAxis },
): MatchResult[] {
  const eligible = listings.filter((listing) => passesHardFilters(profile, listing));

  // Computed once per call (not per comparison) over the full candidate pool.
  const docFreq = tagDocumentFrequency(listings);
  const totalListings = listings.length;

  const byId = (a: MatchListing, b: MatchListing) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  let sorted: MatchListing[];
  if (!opts?.sort) {
    // Default blend: rank by the composite relevance, precomputed once per listing (not per
    // comparison) so the sort is O(n log n), then id for a deterministic tiebreak.
    const relevance = new Map<MatchListing, number>();
    for (const l of eligible) relevance.set(l, relevanceScore(profile, l, docFreq, totalListings));
    sorted = [...eligible].sort(
      (a, b) => relevance.get(b)! - relevance.get(a)! || byId(a, b),
    );
  } else {
    const byTagOverlapDesc = (a: MatchListing, b: MatchListing) =>
      tagOverlapScore(profile, b, docFreq, totalListings) -
      tagOverlapScore(profile, a, docFreq, totalListings);
    const byFitDesc = (a: MatchListing, b: MatchListing) => sortFit(profile, b) - sortFit(profile, a);
    const byDistanceAsc = (a: MatchListing, b: MatchListing) =>
      sortDistance(profile, a) - sortDistance(profile, b);
    const byCostAsc = (a: MatchListing, b: MatchListing) => costRank(a) - costRank(b);

    // Compose comparators for the requested axis; fall through to id for a stable order.
    const comparators: ((a: MatchListing, b: MatchListing) => number)[] =
      opts.sort === "fit"
        ? [byFitDesc, byTagOverlapDesc, byId]
        : opts.sort === "distance"
          ? [byDistanceAsc, byTagOverlapDesc, byId]
          : [byCostAsc, byTagOverlapDesc, byId]; // "cost"

    sorted = [...eligible].sort((a, b) => {
      for (const cmp of comparators) {
        const r = cmp(a, b);
        if (r !== 0) return r;
      }
      return 0;
    });
  }

  return sorted.map((listing) => ({
    id: listing.id,
    matchedTagSlugs: sharedTags(profile, listing),
    fitLabel: fitLabel(profile, listing),
    distanceKm: distanceKm(profile, listing),
    costType: listing.costType,
    costAmount: listing.costAmount,
  }));
}

/**
 * Boost the listing kinds a student said they're looking for (onboarding "what are you looking
 * for" step, BUILD_PROMPT §6) — e.g. internships/companies vs. camps vs. research labs. A
 * STABLE partition: preferred-kind items move earlier, each side keeping its existing relative
 * order (already ranked by tag overlap/fit/etc.), so this is a pure reordering pass that composes
 * with any prior sort. Never a hard filter — non-preferred kinds are still returned, just later
 * (§0.4: every listing here already shares an interest tag; kind is a soft preference only).
 * An empty `preferredKinds` is a no-op (every item ties, so relative order is fully preserved).
 */
export function boostPreferredKinds<T extends { kind: ListingKind }>(
  items: T[],
  preferredKinds: ListingKind[],
): T[] {
  if (preferredKinds.length === 0) return items;
  const preferred = new Set(preferredKinds);
  return [...items].sort(
    (a, b) => Number(preferred.has(b.kind)) - Number(preferred.has(a.kind)),
  );
}

/**
 * Gentle diversity re-rank so the top of the feed rotates through a student's different interests
 * instead of showing a long run of near-identical cards that all matched on the same facet ("too
 * broad/samey"). Walks the already-relevance-ranked list; once `maxRun` items with the same
 * `facet` have appeared back-to-back, it pulls forward the first differently-faceted item within a
 * short `lookahead` window. Relevance still dominates — an item can only move up by at most
 * `lookahead` slots, so a far-worse listing never leapfrogs a far-better one. Deterministic, and
 * a no-op when everything shares one facet (nothing to interleave with). Does not mutate `items`.
 */
export function diversifyByFacet<T>(
  items: T[],
  facet: (item: T) => string,
  opts: { lookahead?: number; maxRun?: number } = {},
): T[] {
  const lookahead = opts.lookahead ?? 8;
  const maxRun = opts.maxRun ?? 2;
  const remaining = [...items];
  const out: T[] = [];
  let lastFacet: string | null = null;
  let run = 0;

  while (remaining.length > 0) {
    let idx = 0;
    // Only intervene when the current facet run is saturated and the head would extend it.
    if (lastFacet !== null && run >= maxRun && facet(remaining[0]) === lastFacet) {
      const limit = Math.min(lookahead, remaining.length);
      for (let i = 1; i < limit; i++) {
        if (facet(remaining[i]) !== lastFacet) {
          idx = i;
          break;
        }
      }
    }
    const [picked] = remaining.splice(idx, 1);
    const f = facet(picked);
    if (f === lastFacet) run += 1;
    else {
      lastFacet = f;
      run = 1;
    }
    out.push(picked);
  }
  return out;
}
