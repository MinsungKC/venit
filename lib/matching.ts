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
 */
import { cosine } from "./vec";
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
 *  - default ("blend"): fit desc, then distance asc, then cost asc.
 *  - "fit":      fit desc.
 *  - "distance": distance asc (remote nearest).
 *  - "cost":     cost asc.
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

  const byId = (a: MatchListing, b: MatchListing) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const byFitDesc = (a: MatchListing, b: MatchListing) =>
    sortFit(profile, b) - sortFit(profile, a);
  const byDistanceAsc = (a: MatchListing, b: MatchListing) =>
    sortDistance(profile, a) - sortDistance(profile, b);
  const byCostAsc = (a: MatchListing, b: MatchListing) => costRank(a) - costRank(b);

  // Compose comparators for the requested axis; fall through to id for a stable order.
  const comparators: ((a: MatchListing, b: MatchListing) => number)[] =
    opts?.sort === "fit"
      ? [byFitDesc, byId]
      : opts?.sort === "distance"
        ? [byDistanceAsc, byId]
        : opts?.sort === "cost"
          ? [byCostAsc, byId]
          : [byFitDesc, byDistanceAsc, byCostAsc, byId]; // blend (default)

  const sorted = [...eligible].sort((a, b) => {
    for (const cmp of comparators) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  });

  return sorted.map((listing) => ({
    id: listing.id,
    matchedTagSlugs: sharedTags(profile, listing),
    fitLabel: fitLabel(profile, listing),
    distanceKm: distanceKm(profile, listing),
    costType: listing.costType,
    costAmount: listing.costAmount,
  }));
}
