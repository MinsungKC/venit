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

/**
 * Fetch a page of approved listings. SINGLE SOURCE OF TRUTH for the seed catalog is the generated
 * JSON — the SAME file `/match` reads — so browse and match can never drift (the old code read the
 * whole catalog from Postgres here while /match read the JSON, which is exactly how new data showed
 * up in one place but not the other). The DB is consulted only for the one kind of content that
 * lives nowhere else: approved org self-submissions (source='self_registered'), which are merged
 * in. Filtering/sorting/paging run in-memory over the combined set (same as /match's approach).
 */
export async function getListings(q: ListingQuery = {}): Promise<ListingsResult> {
  const { kind, limit = 90, offset = 0 } = q;

  const seed = readGenerated<ListingRecord[]>(GENERATED_LISTINGS);
  const tagLabel = new Map(
    readGenerated<TagRecord[]>(GENERATED_TAGS).map((t) => [t.slug, t.label]),
  );

  const seedView: ListingView[] = seed.map((l) => ({
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

  // Merge approved org self-submissions (DB-only content). Fresh submissions lead the catalog.
  const orgSubmissions = await loadApprovedOrgSubmissions();
  const catalog = [...orgSubmissions, ...seedView];

  const counts: Record<string, number> = {};
  for (const l of catalog) counts[l.kind] = (counts[l.kind] ?? 0) + 1;

  const filtered = kind ? catalog.filter((l) => l.kind === kind) : catalog;
  const prominent = (l: ListingView) =>
    l.badges.includes("top_company") || l.badges.includes("large_company") ? 1 : 0;
  const sorted = [...filtered].sort(
    (a, b) =>
      prominent(b) - prominent(a) ||
      (b.team_size ?? 0) - (a.team_size ?? 0) ||
      Number(b.is_recruiting) - Number(a.is_recruiting) ||
      a.title.localeCompare(b.title),
  );

  return {
    listings: sorted.slice(offset, offset + limit),
    total: filtered.length,
    counts,
    source: orgSubmissions.length > 0 ? "database" : "static",
  };
}

/**
 * The only content that lives in the DB but not the generated JSON: org self-registrations an admin
 * has approved (source='self_registered'). Returns [] when there's no DB. Small result set — this
 * is NOT the bulk catalog (that comes from the JSON), so browse and match stay in sync.
 */
async function loadApprovedOrgSubmissions(): Promise<ListingView[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const res = await pool.query<ListingView>(
      `select l.title, l.slug, l.kind, l.url, l.short_description, l.location_name,
              l.is_remote, l.team_size, l.industry, l.is_recruiting, l.badges,
              coalesce(array_agg(t.label order by t.label)
                       filter (where t.label is not null), '{}') as tags
         from listings l
         left join listing_interest_tags lit on lit.listing_id = l.id
         left join interest_tags t on t.id = lit.tag_id
        where l.status = 'approved' and l.source::text = 'self_registered'
        group by l.id
        order by l.id desc`,
    );
    return res.rows.map((r) => ({ ...r, badges: r.badges ?? [] }));
  } catch {
    return []; // never let a DB hiccup take down browse — the JSON catalog still renders
  }
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
