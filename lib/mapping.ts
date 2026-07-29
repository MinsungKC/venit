/**
 * Pure transforms from the yc-oss company shape to our `listings` + `interest_tags`
 * model. Kept side-effect-free so the same logic feeds both the Postgres importer
 * (scripts/import-companies.ts) and the static builder (scripts/build-listings-json.ts),
 * and so it is unit-testable without a database (__tests__/mapping.test.ts).
 *
 * Guardrail (BUILD_PROMPT §0.4 / §2c): a listing that shares zero interest tags can
 * never be shown, so `buildDataset` drops any company that yields no tags and never
 * emits an `approved` listing without at least one tag.
 */

/** Subset of the yc-oss company object we consume. */
export interface YcCompany {
  id: number;
  name: string;
  slug: string;
  website?: string | null;
  one_liner?: string | null;
  long_description?: string | null;
  team_size?: number | null;
  all_locations?: string | null;
  industry?: string | null;
  subindustry?: string | null;
  tags?: string[] | null;
  regions?: string[] | null;
  status?: string | null;
  isHiring?: boolean | null;
  top_company?: boolean | null;
  nonprofit?: boolean | null;
}

export type CostType = "free" | "paid" | "stipend" | "unknown";
export type ListingStatus = "pending" | "approved" | "rejected";

export interface ListingRecord {
  external_id: string;
  source: "yc";
  kind: "company";
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
  /** Interest-tag slugs linked to this listing (always ≥ 1 for emitted rows). */
  tag_slugs: string[];
}

export interface TagRecord {
  slug: string;
  label: string;
  /** Most common yc industry among companies carrying this tag (a coarse domain). */
  domain: string | null;
  is_niche: boolean;
  status: "active" | "pending";
}

export interface Dataset {
  listings: ListingRecord[];
  tags: TagRecord[];
}

/** yc statuses we treat as dead and exclude entirely. */
const DEAD_STATUSES = new Set(["Inactive", "Dead"]);

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

/** First location string; yc joins multiples with ";". */
export function locationName(all_locations?: string | null): string | null {
  if (!all_locations) return null;
  const first = all_locations.split(";")[0]?.trim();
  return first || null;
}

export function isRemote(c: YcCompany): boolean {
  const regions = c.regions ?? [];
  if (regions.some((r) => /remote/i.test(r))) return true;
  return /\bremote\b/i.test(c.all_locations ?? "");
}

/**
 * A company is not itself a paid/free program, so cost is `unknown` — the field
 * exists for programs/opportunities added in later passes.
 */
export function costType(_c: YcCompany): CostType {
  return "unknown";
}

export function badgesFor(c: YcCompany): string[] {
  const b: string[] = [];
  if (c.top_company) b.push("top_company");
  if (c.nonprofit) b.push("nonprofit");
  return b;
}

/** Interest tags for a single company: its yc tags (deduped, slugged). */
export function tagLabels(c: YcCompany): string[] {
  const seen = new Map<string, string>(); // slug -> label
  for (const raw of c.tags ?? []) {
    const label = raw.trim();
    if (!label) continue;
    const slug = slugify(label);
    if (slug && !seen.has(slug)) seen.set(slug, label);
  }
  return [...seen.values()];
}

/** Map one company to a listing shell (tags filled in by buildDataset). */
export function mapCompany(c: YcCompany): Omit<ListingRecord, "tag_slugs"> {
  return {
    external_id: String(c.id),
    source: "yc",
    kind: "company",
    title: c.name.trim(),
    slug: c.slug?.trim() || slugify(c.name),
    url: c.website?.trim() || null,
    short_description: c.one_liner ? truncate(c.one_liner, 300) : null,
    long_description: c.long_description?.trim() || null,
    location_name: locationName(c.all_locations),
    is_remote: isRemote(c),
    team_size: typeof c.team_size === "number" && c.team_size > 0 ? c.team_size : null,
    industry: c.industry?.trim() || null,
    subindustry: c.subindustry?.replace(/^.*->\s*/, "").trim() || c.subindustry?.trim() || null,
    cost_type: costType(c),
    is_recruiting: Boolean(c.isHiring),
    badges: badgesFor(c),
    status: "approved",
  };
}

/**
 * Build the full dataset from raw companies:
 *  - drops dead companies and any company with zero interest tags,
 *  - dedupes by (source, external_id) and by slug,
 *  - assigns each tag a coarse `domain` = its most common industry.
 */
export function buildDataset(companies: YcCompany[]): Dataset {
  const listings: ListingRecord[] = [];
  const seenExternal = new Set<string>();
  const usedSlugs = new Set<string>();

  // tag slug -> { label, industryCounts }
  const tagStats = new Map<string, { label: string; industries: Map<string, number> }>();

  for (const c of companies) {
    if (!c || !c.name || c.status == null) continue;
    if (DEAD_STATUSES.has(c.status)) continue;

    const labels = tagLabels(c);
    if (labels.length === 0) continue; // guardrail: no tags => never shown

    const base = mapCompany(c);
    if (seenExternal.has(base.external_id)) continue;
    seenExternal.add(base.external_id);

    let slug = base.slug || slugify(base.title) || base.external_id;
    if (usedSlugs.has(slug)) slug = `${slug}-${base.external_id}`;
    usedSlugs.add(slug);

    const tag_slugs: string[] = [];
    for (const label of labels) {
      const s = slugify(label);
      tag_slugs.push(s);
      const stat = tagStats.get(s) ?? { label, industries: new Map() };
      if (base.industry) {
        stat.industries.set(base.industry, (stat.industries.get(base.industry) ?? 0) + 1);
      }
      tagStats.set(s, stat);
    }

    listings.push({ ...base, slug, tag_slugs });
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
