import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "./db";
import { matchByInterest } from "./matching";
import type { ListingKind, ListingRecord, TagRecord } from "./mapping";

/** The shape the /listings UI renders. Deliberately contains NO personality data. */
export interface ListingView {
  title: string;
  slug: string;
  kind: ListingKind;
  url: string | null;
  short_description: string | null;
  location_name: string | null;
  is_remote: boolean;
  team_size: number | null;
  industry: string | null;
  is_recruiting: boolean;
  badges: string[];
  tags: string[]; // interest-tag labels — the "why you're seeing this"
}

export interface ListingsResult {
  listings: ListingView[];
  total: number;
  counts: Record<string, number>; // approved count per kind (for filter tabs)
  source: "database" | "static";
}

const GENERATED_LISTINGS = join(process.cwd(), "public", "data", "listings.generated.json");
const GENERATED_TAGS = join(process.cwd(), "public", "data", "tags.generated.json");

export interface ListingQuery {
  kind?: ListingKind;
  /** Canonical interest-tag slugs the user picked. A listing must share >= 1 (guardrail §4). */
  tags?: string[];
  limit?: number;
  offset?: number;
}

/** Fetch a page of approved listings, from Postgres if configured else the static file. */
export async function getListings(q: ListingQuery = {}): Promise<ListingsResult> {
  const { kind, tags = [], limit = 90, offset = 0 } = q;
  const matching = tags.length > 0;
  const pool = getPool();

  if (pool) {
    // Params: $1 limit, $2 offset, $3 tag slugs (always present), $4 kind (optional).
    const params: unknown[] = [limit, offset, tags];
    let where = "";
    if (kind) {
      params.push(kind);
      where = `and l.kind = $${params.length}`;
    }
    // Only listings sharing >= 1 selected tag when matching; ranked by shared-tag count.
    const having = matching ? `having count(*) filter (where t.slug = any($3)) > 0` : ``;
    const [rows, counts] = await Promise.all([
      pool.query<ListingView & { shared: number }>(
        `select l.title, l.slug, l.kind, l.url, l.short_description, l.location_name,
                l.is_remote, l.team_size, l.industry, l.is_recruiting, l.badges,
                coalesce(array_agg(t.label order by t.label)
                         filter (where t.label is not null), '{}') as tags,
                count(*) filter (where t.slug = any($3)) as shared
           from listings l
           left join listing_interest_tags lit on lit.listing_id = l.id
           left join interest_tags t on t.id = lit.tag_id
          where l.status = 'approved' ${where}
          group by l.id
          ${having}
          order by shared desc,
                   (l.badges ? 'top_company' or l.badges ? 'large_company') desc,
                   l.team_size desc nulls last,
                   l.is_recruiting desc,
                   l.title
          limit $1 offset $2`,
        params,
      ),
      matching
        ? pool.query<{ kind: string; n: string }>(
            `select l.kind, count(*)::text as n
               from listings l
              where l.status = 'approved'
                and exists (
                  select 1 from listing_interest_tags lit
                    join interest_tags t on t.id = lit.tag_id
                   where lit.listing_id = l.id and t.slug = any($1))
              group by l.kind`,
            [tags],
          )
        : pool.query<{ kind: string; n: string }>(
            `select kind, count(*)::text as n from listings where status='approved' group by kind`,
          ),
    ]);
    const countMap: Record<string, number> = {};
    let total = 0;
    for (const r of counts.rows) {
      countMap[r.kind] = Number(r.n);
      if (!kind || r.kind === kind) total += Number(r.n);
    }
    return {
      listings: rows.rows.map((r) => ({ ...r, badges: r.badges ?? [] })),
      total,
      counts: countMap,
      source: "database",
    };
  }

  // Fallback: static generated dataset.
  const all = readGenerated<ListingRecord[]>(GENERATED_LISTINGS);
  const tagLabel = staticTagLabels();

  // Apply interest matching across all kinds first, so the per-kind tab counts reflect matches.
  const matched = matchByInterest(all, tags);
  const counts: Record<string, number> = {};
  for (const l of matched) counts[l.kind] = (counts[l.kind] ?? 0) + 1;

  const filtered = kind ? matched.filter((l) => l.kind === kind) : matched;
  const prominent = (l: ListingRecord) =>
    l.badges.includes("top_company") || l.badges.includes("large_company") ? 1 : 0;
  const sorted = [...filtered].sort(
    (a, b) =>
      b.shared - a.shared ||
      prominent(b) - prominent(a) ||
      (b.team_size ?? 0) - (a.team_size ?? 0) ||
      Number(b.is_recruiting) - Number(a.is_recruiting) ||
      a.title.localeCompare(b.title),
  );
  const view = sorted.slice(offset, offset + limit).map((l) => toStaticView(l, tagLabel));
  return { listings: view, total: filtered.length, counts, source: "static" };
}

/** Fetch specific listings by slug (for the shortlist). Order is NOT guaranteed; the caller
 *  reorders to the student's saved order. Returns only approved listings. */
export async function getListingsBySlugs(slugs: string[]): Promise<ListingView[]> {
  if (slugs.length === 0) return [];
  const pool = getPool();
  if (pool) {
    const r = await pool.query<ListingView>(
      `select l.title, l.slug, l.kind, l.url, l.short_description, l.location_name,
              l.is_remote, l.team_size, l.industry, l.is_recruiting, l.badges,
              coalesce(array_agg(t.label order by t.label)
                       filter (where t.label is not null), '{}') as tags
         from listings l
         left join listing_interest_tags lit on lit.listing_id = l.id
         left join interest_tags t on t.id = lit.tag_id
        where l.status = 'approved' and l.slug = any($1)
        group by l.id`,
      [slugs],
    );
    return r.rows.map((row) => ({ ...row, badges: row.badges ?? [] }));
  }
  const wanted = new Set(slugs);
  const tagLabel = staticTagLabels();
  return readGenerated<ListingRecord[]>(GENERATED_LISTINGS)
    .filter((l) => wanted.has(l.slug))
    .map((l) => toStaticView(l, tagLabel));
}

function staticTagLabels(): Map<string, string> {
  return new Map(readGenerated<TagRecord[]>(GENERATED_TAGS).map((t) => [t.slug, t.label]));
}

/** Map a stored ListingRecord to the student-facing view (no personality fields, ever). */
function toStaticView(l: ListingRecord, tagLabel: Map<string, string>): ListingView {
  return {
    title: l.title,
    slug: l.slug,
    kind: l.kind,
    url: l.url,
    short_description: l.short_description,
    location_name: l.location_name,
    is_remote: l.is_remote,
    team_size: l.team_size,
    industry: l.industry,
    is_recruiting: l.is_recruiting,
    badges: l.badges,
    tags: l.tag_slugs.map((s) => tagLabel.get(s) ?? s),
  };
}

/** A selectable interest tag for the picker UI. */
export interface TagOption {
  slug: string;
  label: string;
  domain: string | null;
}

/** All interest tags (for the picker), from Postgres if configured else the static file. */
export async function getInterestTags(): Promise<TagOption[]> {
  const pool = getPool();
  if (pool) {
    const r = await pool.query<TagOption>(
      `select slug, label, domain from interest_tags order by domain nulls last, label`,
    );
    return r.rows;
  }
  const tags = readGenerated<TagRecord[]>(GENERATED_TAGS);
  return tags
    .map((t) => ({ slug: t.slug, label: t.label, domain: t.domain }))
    .sort(
      (a, b) =>
        (a.domain ?? "￿").localeCompare(b.domain ?? "￿") ||
        a.label.localeCompare(b.label),
    );
}

function readGenerated<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    throw new Error(
      `Missing ${path}. Run \`npm run data:build\` (or connect a database via DATABASE_URL).`,
    );
  }
}
