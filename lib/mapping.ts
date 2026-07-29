/**
 * Source-agnostic core: normalized listings from ANY source (yc, S&P 500, curated
 * research labs / programs) are merged into our `listings` + `interest_tags` model.
 *
 * Each source adapter (lib/sources/*) produces `NormalizedListing[]`; `buildDataset`
 * dedupes across sources, guarantees slug uniqueness, and aggregates the tag vocabulary.
 *
 * Guardrail (BUILD_PROMPT §0.4 / §2c): a listing that shares zero interest tags can never
 * be shown, so `buildDataset` drops any item with no tags and never emits an `approved`
 * listing without at least one tag.
 */

export type CostType = "free" | "paid" | "stipend" | "unknown";
export type ListingStatus = "pending" | "approved" | "rejected";
export type ListingKind = "program" | "company" | "opportunity" | "camp" | "research_lab";
export type ListingSource = "yc" | "sp500" | "curated";

export interface ListingRecord {
  external_id: string;
  source: ListingSource;
  kind: ListingKind;
  title: string;
  slug: string;
  url: string | null;
  short_description: string | null;
  long_description: string | null;
  location_name: string | null;
  is_remote: boolean;
  team_size: number | null;
  industry: string | null;
  subindustry: string | null;
  cost_type: CostType;
  is_recruiting: boolean;
  badges: string[];
  status: ListingStatus;
  grade_min: number | null;
  grade_max: number | null;
  /** Interest-tag slugs linked to this listing (always ≥ 1 for emitted rows). */
  tag_slugs: string[];
}

/** What a source adapter emits: a full listing minus derived slug/tag_slugs. */
export type NormalizedListing = Omit<ListingRecord, "tag_slugs" | "slug"> & {
  slug?: string | null;
  /** Human-readable interest-tag labels; slugged + linked by buildDataset. */
  tag_labels: string[];
};

export interface TagRecord {
  slug: string;
  label: string;
  /** Most common industry among listings carrying this tag (a coarse domain). */
  domain: string | null;
  is_niche: boolean;
  status: "active" | "pending";
}

export interface Dataset {
  listings: ListingRecord[];
  tags: TagRecord[];
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Trim to <= max chars on a word/sentence boundary where possible. */
export function truncate(text: string, max = 300): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(" "));
  return (cut > max * 0.6 ? slice.slice(0, cut) : slice).trimEnd() + "…";
}

/** First location string; sources join multiples with ";". */
export function locationName(all_locations?: string | null): string | null {
  if (!all_locations) return null;
  const first = all_locations.split(";")[0]?.trim();
  return first || null;
}

/** Map a numeric price to a cost type (used by program/opportunity sources). */
export function priceToCost(price?: number | null): CostType {
  if (price == null) return "unknown";
  return price > 0 ? "paid" : "free";
}

/** Dedupe + slug labels, preserving first-seen human label per slug. */
export function labelsToSlugPairs(labels: string[]): { slug: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    const slug = slugify(label);
    if (slug && !seen.has(slug)) seen.set(slug, label);
  }
  return [...seen.entries()].map(([slug, label]) => ({ slug, label }));
}

/**
 * Merge normalized listings from all sources into the final dataset:
 *  - drops any listing with zero interest tags (guardrail §0.4),
 *  - dedupes by (source, external_id) and enforces unique slugs across sources,
 *  - assigns each tag a coarse `domain` = its most common industry.
 */
export function buildDataset(items: NormalizedListing[]): Dataset {
  const listings: ListingRecord[] = [];
  const seenExternal = new Set<string>();
  const usedSlugs = new Set<string>();

  // tag slug -> { label, industry counts }
  const tagStats = new Map<string, { label: string; industries: Map<string, number> }>();

  for (const item of items) {
    if (!item || !item.title) continue;

    const pairs = labelsToSlugPairs(item.tag_labels);
    if (pairs.length === 0) continue; // guardrail: no tags => never shown

    const externalKey = `${item.source}:${item.external_id}`;
    if (seenExternal.has(externalKey)) continue;
    seenExternal.add(externalKey);

    let slug = (item.slug && item.slug.trim()) || slugify(item.title) || item.external_id;
    if (usedSlugs.has(slug)) slug = `${slug}-${item.source}-${slugify(item.external_id)}`;
    usedSlugs.add(slug);

    const tag_slugs: string[] = [];
    for (const { slug: s, label } of pairs) {
      tag_slugs.push(s);
      const stat = tagStats.get(s) ?? { label, industries: new Map() };
      if (item.industry) {
        stat.industries.set(item.industry, (stat.industries.get(item.industry) ?? 0) + 1);
      }
      tagStats.set(s, stat);
    }

    const { tag_labels: _drop, ...rest } = item;
    listings.push({ ...rest, slug, tag_slugs });
  }

  const tags: TagRecord[] = [...tagStats.entries()]
    .map(([slug, { label, industries }]) => {
      let domain: string | null = null;
      let best = 0;
      for (const [ind, n] of industries) {
        if (n > best) {
          best = n;
          domain = ind;
        }
      }
      return { slug, label, domain, is_niche: false, status: "active" as const };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return { listings, tags };
}
