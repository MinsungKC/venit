import "server-only";
import { getPool } from "./db";

/**
 * Admin data + auth for the moderation panel (BUILD_PROMPT §4). Two ways in:
 *  - a shared ADMIN_KEY in the env (`?key=...`), the original bootstrap gate — kept so admin
 *    access never fully depends on the `roles` table being reachable/seeded;
 *  - a signed-in Supabase user whose `roles.is_admin` is true (see `isAdmin`), granted via
 *    `scripts/grant-admin.ts`. Either is sufficient. Nothing here touches personality data.
 */
export function adminKeyOk(key?: string | null): boolean {
  const expected = process.env.ADMIN_KEY;
  return !!expected && !!key && key === expected;
}

/** Whether the signed-in user (by id) has been granted admin via the `roles` table. */
export async function isAdmin(userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  const pool = getPool();
  if (!pool) return false;
  const r = await pool.query<{ is_admin: boolean }>(`select is_admin from roles where user_id = $1`, [userId]);
  return r.rows[0]?.is_admin ?? false;
}

export interface PendingRow {
  id: number;
  slug: string;
  title: string;
  kind: string;
  short_description: string | null;
  url: string | null;
  location_name: string | null;
  source: string;
  tags: string[];
}

/** Listings awaiting review (the moderation queue). */
export async function getPendingListings(limit = 100): Promise<PendingRow[]> {
  const pool = getPool();
  if (!pool) return [];
  const r = await pool.query<PendingRow & { tags: string[] | null }>(
    `select l.id, l.slug, l.title, l.kind, l.short_description, l.url, l.location_name, l.source,
            coalesce(array_agg(t.label order by t.label) filter (where t.label is not null), '{}') as tags
       from listings l
       left join listing_interest_tags lit on lit.listing_id = l.id
       left join interest_tags t on t.id = lit.tag_id
      where l.status = 'pending'
      group by l.id
      order by l.created_at desc
      limit $1`,
    [limit],
  );
  return r.rows.map((x) => ({ ...x, tags: x.tags ?? [] }));
}

export interface SupplyGap {
  slug: string;
  label: string;
  domain: string | null;
  approved: number;
}

/**
 * Supply-gap analytics (BUILD_PROMPT §7): interest tags with the fewest approved listings, so
 * admins know where to focus outreach.
 */
export async function getSupplyGaps(limit = 30): Promise<SupplyGap[]> {
  const pool = getPool();
  if (!pool) return [];
  const r = await pool.query<SupplyGap>(
    `select t.slug, t.label, t.domain,
            count(l.id) filter (where l.status = 'approved')::int as approved
       from interest_tags t
       left join listing_interest_tags lit on lit.tag_id = t.id
       left join listings l on l.id = lit.listing_id
      group by t.id
      order by approved asc, t.label asc
      limit $1`,
    [limit],
  );
  return r.rows;
}

export interface ProviderRow {
  id: number;
  title: string;
  kind: string;
  status: string;
  tags: string[];
  created: string;
}

/** Recent self-registered listings for the provider dashboard. */
export async function getProviderListings(limit = 10): Promise<ProviderRow[]> {
  const pool = getPool();
  if (!pool) return [];
  const r = await pool.query<ProviderRow & { tags: string[] | null }>(
    `select l.id, l.title, l.kind, l.status, to_char(l.created_at, 'Mon DD, YYYY') as created,
            coalesce(array_agg(t.label order by t.label) filter (where t.label is not null), '{}') as tags
       from listings l
       left join listing_interest_tags lit on lit.listing_id = l.id
       left join interest_tags t on t.id = lit.tag_id
      where l.source = 'self_registered'
      group by l.id
      order by l.created_at desc
      limit $1`,
    [limit],
  );
  return r.rows.map((x) => ({ ...x, tags: x.tags ?? [] }));
}

export async function getProviderStats(): Promise<{ listings: number; tags: number; live: number }> {
  const pool = getPool();
  if (!pool) return { listings: 0, tags: 0, live: 0 };
  const r = await pool.query<{ listings: number; tags: number; live: number }>(
    `select count(distinct l.id)::int as listings,
            count(distinct lit.tag_id)::int as tags,
            count(distinct l.id) filter (where l.status = 'approved')::int as live
       from listings l
       left join listing_interest_tags lit on lit.listing_id = l.id
      where l.source = 'self_registered'`,
  );
  return r.rows[0] ?? { listings: 0, tags: 0, live: 0 };
}

export interface AdminStats {
  approved: number;
  pending: number;
  rejected: number;
  orgs: number;
  tags: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const pool = getPool();
  if (!pool) return { approved: 0, pending: 0, rejected: 0, orgs: 0, tags: 0 };
  const [byStatus, orgs, tags] = await Promise.all([
    pool.query<{ status: string; n: number }>(`select status, count(*)::int as n from listings group by status`),
    pool.query<{ n: number }>(`select count(*)::int as n from orgs`),
    pool.query<{ n: number }>(`select count(*)::int as n from interest_tags`),
  ]);
  const s: AdminStats = { approved: 0, pending: 0, rejected: 0, orgs: orgs.rows[0]?.n ?? 0, tags: tags.rows[0]?.n ?? 0 };
  for (const row of byStatus.rows) {
    if (row.status === "approved") s.approved = row.n;
    else if (row.status === "pending") s.pending = row.n;
    else if (row.status === "rejected") s.rejected = row.n;
  }
  return s;
}
