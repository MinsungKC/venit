import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CostType, ListingKind, ListingRecord, TagRecord } from "./mapping";
import type { MatchListing, MatchProfile, SortAxis } from "./match-types";
import { match } from "./matching";

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
}

export interface MatchedListing extends MatchListingLite {
  /** Human labels of the interest tags shared with the user — the "why you're seeing this" (§7). */
  matchedTags: string[];
}

const GENERATED_LISTINGS = join(process.cwd(), "public", "data", "listings.generated.json");
const GENERATED_TAGS = join(process.cwd(), "public", "data", "tags.generated.json");

function read<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    throw new Error(`Missing ${path}. Run \`npm run data:build\` first.`);
  }
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

function toMatchListing(l: MatchListingLite): MatchListing {
  return {
    id: l.slug,
    kind: l.kind,
    status: "approved", // the static dataset only contains shown (approved) listings
    tagSlugs: l.tag_slugs,
    ageMin: null,
    ageMax: null,
    gradeMin: l.grade_min,
    gradeMax: l.grade_max,
    lat: null,
    lng: null,
    isRemote: l.is_remote,
    costType: l.cost_type,
    costAmount: null,
    radiusKm: null,
    desiredPersonalityVector: null,
  };
}

export interface MatchParams {
  tagSlugs: string[];
  grade: number | null;
  age: number | null;
  sort?: SortAxis;
  /** UI filters (applied after the hard-filter/ranking pass). */
  kind?: ListingKind;
  freeOnly?: boolean;
  remoteOnly?: boolean;
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

  const profile: MatchProfile = {
    age: params.age,
    grade: params.grade,
    lat: null,
    lng: null,
    interestTagSlugs: params.tagSlugs,
    personalityVector: null,
  };

  const results = match(profile, listings.map(toMatchListing), { sort: params.sort });

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
      matchedTags: r.matchedTagSlugs.map((s) => labelBySlug.get(s) ?? s),
    };
  });

  // NB: `kind` is intentionally NOT filtered here — the page filters by kind so it can still
  // show per-kind counts in the filter bar. freeOnly/remoteOnly are global toggles.
  if (params.freeOnly) out = out.filter((l) => l.cost_type === "free");
  if (params.remoteOnly) out = out.filter((l) => l.is_remote);

  // Order by number of shared interest tags (strongest signal until personality ranking exists),
  // unless the user asked for an explicit axis, in which case the engine's order is preserved.
  return params.sort ? out : out.sort((a, b) => b.matchedTags.length - a.matchedTags.length);
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
    }));
}
