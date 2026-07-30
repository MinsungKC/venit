import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CostType, ListingKind, ListingRecord, TagRecord } from "./mapping";
import type { FitLabel, MatchListing, MatchProfile, SortAxis } from "./match-types";
import { boostPreferredKinds, match } from "./matching";
import { regionToLatLng } from "./us-states";

/**
 * How the student wants to treat location (BUILD_PROMPT §5):
 *  - "near":    only in-person opportunities within `radiusKm` of their state (labs gated by §0.5).
 *  - "country": anywhere in the US — in-person labs shown regardless of distance.
 *  - "any":     don't filter by location at all (same as country for this US-only dataset).
 * Remote listings always qualify. Default is "any" so students see everything unless they narrow.
 */
export type LocMode = "near" | "country" | "any";

/** Default travel radius (km ≈ 100 miles) when "near me" is chosen without an explicit radius. */
const DEFAULT_RADIUS_KM = 160;

/**
 * Server-side data + matching for the student `/match` flow (BUILD_PROMPT §5/§6). Matching runs
 * on the server over the static dataset (or, later, SQL) so we never ship the whole listings
 * table to the browser — only the user's chosen interest tags go up, and only matched listings
 * come back. Personality is not involved here (none exists for seed listings), so nothing secret
 * is present; the coarse fit label stays null until org desired-personalities are wired.
 */
export interface MatchTag {
  slug: string;
  label: string;
  domain: string;
}

export interface MatchListingLite {
  slug: string;
  title: string;
  kind: ListingKind;
  url: string | null;
  short_description: string | null;
  location_name: string | null;
  is_remote: boolean;
  cost_type: CostType;
  grade_min: number | null;
  grade_max: number | null;
  is_recruiting: boolean;
  badges: string[];
  tag_slugs: string[];
  niche_slugs?: string[];
}

export interface MatchedListing extends MatchListingLite {
  /** Human labels of the interest tags shared with the user — the "why you're seeing this" (§7). */
  matchedTags: string[];
  /** Coarse personality-fit label (signed-in users only); null otherwise. NEVER the score (§0.1). */
  fitLabel: FitLabel;
}

const GENERATED_LISTINGS = join(process.cwd(), "public", "data", "listings.generated.json");
const GENERATED_TAGS = join(process.cwd(), "public", "data", "tags.generated.json");
const GEOCODE = join(process.cwd(), "public", "data", "geocode.json");
const NICHE_TAGS = join(process.cwd(), "public", "data", "niche-tags.json");

let nicheLabels: Map<string, string> | null = null;
/** slug → label for niche tags, to display niche matches. */
function nicheLabelMap(): Map<string, string> {
  if (nicheLabels) return nicheLabels;
  try {
    const rows = JSON.parse(readFileSync(NICHE_TAGS, "utf8")) as { slug: string; label: string }[];
    nicheLabels = new Map(rows.map((r) => [r.slug, r.label]));
  } catch {
    nicheLabels = new Map();
  }
  return nicheLabels;
}

function read<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    throw new Error(`Missing ${path}. Run \`npm run data:build\` first.`);
  }
}

/** City-level coordinates for lab locations (public/data/geocode.json from `npm run data:geocode`).
 *  Loaded once; empty if the file hasn't been generated (falls back to state centroids). */
let geocodeCache: Record<string, { lat: number; lng: number }> | null = null;
function geocodeMap(): Record<string, { lat: number; lng: number }> {
  if (geocodeCache) return geocodeCache;
  try {
    geocodeCache = JSON.parse(readFileSync(GEOCODE, "utf8"));
  } catch {
    geocodeCache = {};
  }
  return geocodeCache!;
}

/**
 * The personality archetypes (slug + label) for the ORG registration form — orgs may choose the
 * personalities they're seeking (§2c). This is org-facing config, not student-facing: guardrail
 * §0.1 forbids showing a STUDENT their personality, not an org picking desired traits.
 */
export function getArchetypes(): { slug: string; label: string }[] {
  const path = join(process.cwd(), "supabase", "seed", "personality.json");
  const rows = read<{ slug: string; label: string }[]>(path);
  return rows.map((a) => ({ slug: a.slug, label: a.label }));
}

/** The interest-tag catalog, grouped by domain, for the picker UI. */
export function getTagCatalog(): { domain: string; tags: MatchTag[] }[] {
  const tags = read<TagRecord[]>(GENERATED_TAGS);
  const byDomain = new Map<string, MatchTag[]>();
  for (const t of tags) {
    const domain = t.domain ?? "Other";
    const arr = byDomain.get(domain) ?? [];
    arr.push({ slug: t.slug, label: t.label, domain });
    byDomain.set(domain, arr);
  }
  return [...byDomain.entries()]
    .map(([domain, ts]) => ({ domain, tags: ts.sort((a, b) => a.label.localeCompare(b.label)) }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

function toMatchListing(
  l: MatchListingLite,
  mode: LocMode,
  radiusKm: number,
  desiredBySlug?: Map<string, number[]>,
): MatchListing {
  // City-level coords where geocoded (labs), else the state centroid — so the radius is meaningful.
  const city = l.location_name ? geocodeMap()[l.location_name.trim()] : undefined;
  const geo = city ?? regionToLatLng(l.location_name);
  const isLab = l.kind === "research_lab";
  // In "country"/"any" the student explicitly wants labs regardless of distance, so mark in-person
  // labs location-agnostic for the engine (skips §0.5's distance gate — an informed opt-in). The
  // display card still uses the listing's real location, not "Remote".
  const bypassLocation = isLab && (mode === "country" || mode === "any");
  return {
    id: l.slug,
    kind: l.kind,
    status: "approved", // the static dataset only contains shown (approved) listings
    // Include niche tags so a matched free-text niche interest counts as a shared tag (§0.4).
    tagSlugs: l.niche_slugs?.length ? [...l.tag_slugs, ...l.niche_slugs] : l.tag_slugs,
    ageMin: null,
    ageMax: null,
    gradeMin: l.grade_min,
    gradeMax: l.grade_max,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    isRemote: l.is_remote || bypassLocation,
    costType: l.cost_type,
    costAmount: null,
    radiusKm,
    desiredPersonalityVector: desiredBySlug?.get(l.slug) ?? null,
  };
}

export interface MatchParams {
  tagSlugs: string[];
  grade: number | null;
  age: number | null;
  sort?: SortAxis;
  /** How to treat location (default "any"). */
  locMode?: LocMode;
  /** Student's precise coordinates (from geocoding their city) — preferred for "near" mode. */
  userLat?: number | null;
  userLng?: number | null;
  /** Student's state (fallback for "near" mode when no city coords are available). */
  region?: string | null;
  /** Travel radius in km for "near" mode. */
  radiusKm?: number | null;
  /** UI filters (applied after the hard-filter/ranking pass). */
  kind?: ListingKind;
  freeOnly?: boolean;
  remoteOnly?: boolean;
  /** SECRET personality vector of the signed-in student — enables fit ranking (§0.1). */
  personalityVector?: number[] | null;
  /** slug → listing desired-personality vector, for computing the fit label. */
  desiredBySlug?: Map<string, number[]>;
  /** Interest-tag slugs the student favored in the rating deck — nudges those listings up. */
  boostSlugs?: string[];
  /** Niche-tag slugs matched from the student's free-text interests — match + prioritize these. */
  nicheSlugs?: string[];
  /**
   * Listing kinds the student said they're looking for (onboarding "what are you looking for"
   * step) — e.g. internships/companies vs. camps vs. research labs. A soft, stable boost applied
   * last: preferred kinds move earlier while each kind's relative order (by fit/tags) is kept.
   * Never a hard filter — everything stays discoverable by tag (§0.4), this only reorders.
   */
  preferredKinds?: ListingKind[];
}

/**
 * Run the matching engine for the given interests/eligibility and return the matched listings
 * (joined back to their display fields), ordered by how many interest tags they share — the most
 * meaningful signal until personality/location ranking is available.
 *
 * NOTE (§0.5): research labs require a location match, and the static dataset carries no
 * coordinates, so labs are correctly excluded here until listings are geocoded and the user
 * supplies a location. They remain browsable at /listings.
 */
export function runMatch(params: MatchParams): MatchedListing[] {
  const listings = read<ListingRecord[]>(GENERATED_LISTINGS);
  const labelBySlug = new Map(read<TagRecord[]>(GENERATED_TAGS).map((t) => [t.slug, t.label]));
  const bySlug = new Map(listings.map((l) => [l.slug, l]));

  const mode: LocMode = params.locMode ?? "any";
  const radiusKm = params.radiusKm ?? DEFAULT_RADIUS_KM;
  // Prefer the student's geocoded city coordinates; fall back to their state centroid.
  const userGeo =
    mode === "near"
      ? params.userLat != null && params.userLng != null
        ? { lat: params.userLat, lng: params.userLng }
        : regionToLatLng(params.region ?? null)
      : null;
  const hasFit = !!(params.personalityVector && params.desiredBySlug);
  const nicheSlugs = params.nicheSlugs ?? [];
  const profile: MatchProfile = {
    age: params.age,
    grade: params.grade,
    lat: userGeo?.lat ?? null,
    lng: userGeo?.lng ?? null,
    // The student's canonical interests + any niche tags matched from their free text.
    interestTagSlugs: nicheSlugs.length ? [...params.tagSlugs, ...nicheSlugs] : params.tagSlugs,
    personalityVector: params.personalityVector ?? null,
  };
  const nicheLabels = nicheSlugs.length ? nicheLabelMap() : null;

  const results = match(
    profile,
    listings.map((l) => toMatchListing(l, mode, radiusKm, params.desiredBySlug)),
    { sort: params.sort },
  );

  let out: MatchedListing[] = results.map((r) => {
    const l = bySlug.get(r.id)!;
    return {
      slug: l.slug,
      title: l.title,
      kind: l.kind,
      url: l.url,
      short_description: l.short_description,
      location_name: l.location_name,
      is_remote: l.is_remote,
      cost_type: l.cost_type,
      grade_min: l.grade_min,
      grade_max: l.grade_max,
      is_recruiting: l.is_recruiting,
      badges: l.badges,
      tag_slugs: l.tag_slugs,
      niche_slugs: l.niche_slugs,
      matchedTags: r.matchedTagSlugs.map((s) => labelBySlug.get(s) ?? nicheLabels?.get(s) ?? s),
      fitLabel: r.fitLabel,
    };
  });

  // NB: `kind` is intentionally NOT filtered here — the page filters by kind so it can still
  // show per-kind counts in the filter bar. freeOnly/remoteOnly are global toggles.
  if (params.freeOnly) out = out.filter((l) => l.cost_type === "free");
  if (params.remoteOnly) out = out.filter((l) => l.is_remote);

  // Rating-deck curation + niche free-text interests nudge matching listings up (override order).
  const boostAll = [...(params.boostSlugs ?? []), ...nicheSlugs];
  if (!params.sort && boostAll.length) {
    const boost = new Set(boostAll);
    const score = (l: MatchedListing) =>
      l.matchedTags.length +
      3 * [...l.tag_slugs, ...(l.niche_slugs ?? [])].filter((s) => boost.has(s)).length;
    out = [...out].sort((a, b) => score(b) - score(a));
  } else if (!params.sort && !hasFit) {
    // No explicit sort, no boosts, no personality fit: order by shared-tag count, the strongest
    // available signal. (With a personality vector or an explicit sort, keep the engine's order.)
    out = out.sort((a, b) => b.matchedTags.length - a.matchedTags.length);
  }

  // Preferred listing kinds (BUILD_PROMPT §6 "what are you looking for") — a stable boost applied
  // last, on top of whichever order above, so it takes effect no matter which path was taken.
  return boostPreferredKinds(out, params.preferredKinds ?? []);
}

export interface GlobePoint {
  slug: string;
  title: string;
  kind: ListingKind;
  lat: number;
  lng: number;
  location: string;
}

/**
 * Resolve on-map coordinates for matched listings (BUILD_PROMPT §7 map view): city-level from
 * geocode.json where known, else the state centroid. Remote listings and un-geocodable ones are
 * dropped. Capped so the globe stays performant.
 */
export function toGlobePoints(listings: MatchedListing[], cap = 600): GlobePoint[] {
  const geo = geocodeMap();
  const points: GlobePoint[] = [];
  for (const l of listings) {
    if (l.is_remote || !l.location_name) continue;
    const c = geo[l.location_name.trim()] ?? regionToLatLng(l.location_name);
    if (!c) continue;
    points.push({ slug: l.slug, title: l.title, kind: l.kind, lat: c.lat, lng: c.lng, location: l.location_name });
    if (points.length >= cap) break;
  }
  return points;
}

/** The distinct kinds present in the match results, for the filter bar (with counts). */
export function kindCounts(results: MatchedListing[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const l of results) counts[l.kind] = (counts[l.kind] ?? 0) + 1;
  return counts;
}

export interface ListingDetail extends MatchListingLite {
  long_description: string | null;
  apply_url: string | null;
  linkedin_url: string | null;
  industry: string | null;
  team_size: number | null;
  tags: string[]; // interest-tag labels
}

/** Load one listing by slug for its detail page, with its interest-tag labels resolved. */
export function getListingBySlug(slug: string): ListingDetail | null {
  const listings = read<ListingRecord[]>(GENERATED_LISTINGS);
  const l = listings.find((x) => x.slug === slug);
  if (!l) return null;
  const labelBySlug = new Map(read<TagRecord[]>(GENERATED_TAGS).map((t) => [t.slug, t.label]));
  return {
    slug: l.slug,
    title: l.title,
    kind: l.kind,
    url: l.url,
    short_description: l.short_description,
    location_name: l.location_name,
    is_remote: l.is_remote,
    cost_type: l.cost_type,
    grade_min: l.grade_min,
    grade_max: l.grade_max,
    is_recruiting: l.is_recruiting,
    badges: l.badges,
    tag_slugs: l.tag_slugs,
    long_description: l.long_description,
    apply_url: (l as ListingRecord & { apply_url?: string | null }).apply_url ?? null,
    linkedin_url: (l as ListingRecord & { linkedin_url?: string | null }).linkedin_url ?? null,
    industry: l.industry,
    team_size: l.team_size,
    tags: l.tag_slugs.map((s) => labelBySlug.get(s) ?? s),
  };
}

/** Load several listings by slug (order preserved) for a shared/read-only shortlist (§7). */
export function getListingsBySlugs(slugs: string[]): MatchListingLite[] {
  if (slugs.length === 0) return [];
  const want = new Set(slugs);
  const bySlug = new Map<string, ListingRecord>();
  for (const l of read<ListingRecord[]>(GENERATED_LISTINGS)) {
    if (want.has(l.slug)) bySlug.set(l.slug, l);
  }
  return slugs
    .map((s) => bySlug.get(s))
    .filter((l): l is ListingRecord => Boolean(l))
    .map((l) => ({
      slug: l.slug,
      title: l.title,
      kind: l.kind,
      url: l.url,
      short_description: l.short_description,
      location_name: l.location_name,
      is_remote: l.is_remote,
      cost_type: l.cost_type,
      grade_min: l.grade_min,
      grade_max: l.grade_max,
      is_recruiting: l.is_recruiting,
      badges: l.badges,
      tag_slugs: l.tag_slugs,
    }));
}

/**
 * "More like this" (BUILD_PROMPT §7 ★) by shared interest tags — the static dataset has no
 * per-listing embeddings, so we rank by tag overlap (count of shared tags, then title). Same
 * kind is preferred so a company surfaces companies, a lab surfaces labs.
 */
export function similarByTags(slug: string, k = 6): MatchedListing[] {
  const listings = read<ListingRecord[]>(GENERATED_LISTINGS);
  const labelBySlug = new Map(read<TagRecord[]>(GENERATED_TAGS).map((t) => [t.slug, t.label]));
  const target = listings.find((x) => x.slug === slug);
  if (!target) return [];
  const wanted = new Set(target.tag_slugs);

  return listings
    .filter((l) => l.slug !== slug)
    .map((l) => {
      const shared = l.tag_slugs.filter((s) => wanted.has(s));
      return { l, shared, score: shared.length + (l.kind === target.kind ? 0.5 : 0) };
    })
    .filter((x) => x.shared.length > 0)
    .sort((a, b) => b.score - a.score || a.l.title.localeCompare(b.l.title))
    .slice(0, k)
    .map(({ l, shared }) => ({
      slug: l.slug,
      title: l.title,
      kind: l.kind,
      url: l.url,
      short_description: l.short_description,
      location_name: l.location_name,
      is_remote: l.is_remote,
      cost_type: l.cost_type,
      grade_min: l.grade_min,
      grade_max: l.grade_max,
      is_recruiting: l.is_recruiting,
      badges: l.badges,
      tag_slugs: l.tag_slugs,
      matchedTags: shared.map((s) => labelBySlug.get(s) ?? s),
      fitLabel: null,
    }));
}
