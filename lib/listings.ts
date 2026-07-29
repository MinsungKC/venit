import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "./db";
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
  limit?: number;
  offset?: number;
}

/** Fetch a page of approved listings, from Postgres if configured else the static file. */
export async function getListings(q: ListingQuery = {}): Promise<ListingsResult> {
  const { kind, limit = 90, offset = 0 } = q;
  const pool = getPool();

  if (pool) {
    const where = kind ? `and l.kind = $3` : ``;
    const params: unknown[] = kind ? [limit, offset, kind] : [limit, offset];
    const [rows, counts] = await Promise.all([
      pool.query<ListingView>(
        `select l.title, l.slug, l.kind, l.url, l.short_description, l.location_name,
                l.is_remote, l.team_size, l.industry, l.is_recruiting, l.badges,
                coalesce(array_agg(t.label order by t.label)
                         filter (where t.label is not null), '{}') as tags
           from listings l
           left join listing_interest_tags lit on lit.listing_id = l.id
           left join interest_tags t on t.id = lit.tag_id
          where l.status = 'approved' ${where}
          group by l.id
          order by (l.badges ? 'top_company' or l.badges ? 'large_company') desc,
                   l.team_size desc nulls last,
                   l.is_recruiting desc,
                   l.title
          limit $1 offset $2`,
        params,
      ),
      pool.query<{ kind: string; n: string }>(
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
  const tagLabel = new Map(
    readGenerated<TagRecord[]>(GENERATED_TAGS).map((t) => [t.slug, t.label]),
  );
  const counts: Record<string, number> = {};
  for (const l of all) counts[l.kind] = (counts[l.kind] ?? 0) + 1;

  const filtered = kind ? all.filter((l) => l.kind === kind) : all;
  const prominent = (l: ListingRecord) =>
    l.badges.includes("top_company") || l.badges.includes("large_company") ? 1 : 0;
  const sorted = [...filtered].sort(
    (a, b) =>
      prominent(b) - prominent(a) ||
      (b.team_size ?? 0) - (a.team_size ?? 0) ||
      Number(b.is_recruiting) - Number(a.is_recruiting) ||
      a.title.localeCompare(b.title),
  );
  const view: ListingView[] = sorted.slice(offset, offset + limit).map((l) => ({
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
  }));
  return { listings: view, total: filtered.length, counts, source: "static" };
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
