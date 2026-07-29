import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "./db";
import type { ListingRecord, TagRecord } from "./mapping";

/** The shape the /listings UI renders. Deliberately contains NO personality data. */
export interface ListingView {
  title: string;
  slug: string;
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
  source: "database" | "static";
}

const GENERATED_LISTINGS = join(process.cwd(), "public", "data", "listings.generated.json");
const GENERATED_TAGS = join(process.cwd(), "public", "data", "tags.generated.json");

/** Fetch a page of approved listings, from Postgres if configured else the static file. */
export async function getListings(limit = 60, offset = 0): Promise<ListingsResult> {
  const pool = getPool();
  if (pool) {
    const [rows, count] = await Promise.all([
      pool.query<ListingView>(
        `select l.title, l.slug, l.url, l.short_description, l.location_name,
                l.is_remote, l.team_size, l.industry, l.is_recruiting,
                l.badges,
                coalesce(array_agg(t.label order by t.label)
                         filter (where t.label is not null), '{}') as tags
           from listings l
           left join listing_interest_tags lit on lit.listing_id = l.id
           left join interest_tags t on t.id = lit.tag_id
          where l.status = 'approved' and l.kind = 'company'
          group by l.id
          order by l.is_recruiting desc, l.team_size desc nulls last, l.title
          limit $1 offset $2`,
        [limit, offset],
      ),
      pool.query<{ n: string }>(
        `select count(*)::text as n from listings where status='approved' and kind='company'`,
      ),
    ]);
    return {
      listings: rows.rows.map((r) => ({ ...r, badges: r.badges ?? [] })),
      total: Number(count.rows[0].n),
      source: "database",
    };
  }

  // Fallback: static generated dataset.
  const listings = readGenerated<ListingRecord[]>(GENERATED_LISTINGS);
  const tagLabel = new Map(
    readGenerated<TagRecord[]>(GENERATED_TAGS).map((t) => [t.slug, t.label]),
  );
  const sorted = [...listings].sort(
    (a, b) =>
      Number(b.is_recruiting) - Number(a.is_recruiting) ||
      (b.team_size ?? 0) - (a.team_size ?? 0) ||
      a.title.localeCompare(b.title),
  );
  const view: ListingView[] = sorted.slice(offset, offset + limit).map((l) => ({
    title: l.title,
    slug: l.slug,
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
  return { listings: view, total: listings.length, source: "static" };
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
