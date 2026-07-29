/**
 * Import every source (yc, S&P 500, curated) into Postgres (local Supabase by default).
 * Idempotent: upserts interest tags and listings, re-links tags each run.
 *
 *   npm run db:import        (expects DATABASE_URL, defaults to local Supabase)
 *
 * Uses node-postgres directly so the seed does not depend on RLS or service keys. Each
 * listing + its tag links go in one transaction, satisfying the deferred "approved needs
 * >=1 tag" constraint (migration 0001) at commit.
 */
import "dotenv/config";
import { Client } from "pg";
import { loadAllListings } from "../lib/sources";
import { buildDataset, type ListingRecord } from "../lib/mapping";
import { applyClassification, applyTaxonomyDomains } from "../lib/classification";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function main() {
  const built = buildDataset(applyClassification(loadAllListings()));
  const listings = built.listings;
  const tags = applyTaxonomyDomains(built.tags);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const tagId = new Map<string, number>();
    for (const t of tags) {
      const res = await client.query<{ id: number }>(
        `insert into interest_tags (slug, label, domain, is_niche, status)
         values ($1,$2,$3,$4,$5)
         on conflict (slug) do update set label = excluded.label, domain = excluded.domain
         returning id`,
        [t.slug, t.label, t.domain, t.is_niche, t.status],
      );
      tagId.set(t.slug, res.rows[0].id);
    }

    let inserted = 0;
    let updated = 0;
    for (const l of listings) {
      await client.query("begin");
      try {
        const up = await client.query<{ id: number; inserted: boolean }>(
          `insert into listings (
             external_id, source, kind, title, slug, url,
             short_description, long_description, location_name, is_remote,
             team_size, industry, subindustry, cost_type, is_recruiting,
             grade_min, grade_max, badges, status
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           on conflict (source, external_id) do update set
             kind = excluded.kind, title = excluded.title, url = excluded.url,
             short_description = excluded.short_description,
             long_description = excluded.long_description,
             location_name = excluded.location_name, is_remote = excluded.is_remote,
             team_size = excluded.team_size, industry = excluded.industry,
             subindustry = excluded.subindustry, cost_type = excluded.cost_type,
             is_recruiting = excluded.is_recruiting, grade_min = excluded.grade_min,
             grade_max = excluded.grade_max, badges = excluded.badges, status = excluded.status
           returning id, (xmax = 0) as inserted`,
          listingParams(l),
        );
        const id = up.rows[0].id;
        if (up.rows[0].inserted) inserted++;
        else updated++;

        await client.query(`delete from listing_interest_tags where listing_id = $1`, [id]);
        for (const slug of l.tag_slugs) {
          const tid = tagId.get(slug);
          if (tid) {
            await client.query(
              `insert into listing_interest_tags (listing_id, tag_id) values ($1,$2)
               on conflict do nothing`,
              [id, tid],
            );
          }
        }
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }

    const bySource = new Map<string, number>();
    for (const l of listings) bySource.set(l.source, (bySource.get(l.source) ?? 0) + 1);
    console.log(
      `db:import — ${inserted} inserted, ${updated} updated; ${tags.length} tags; ` +
        `sources ${[...bySource].map(([s, n]) => `${s}:${n}`).join(" ")}.`,
    );
  } finally {
    await client.end();
  }
}

function listingParams(l: ListingRecord) {
  return [
    l.external_id, l.source, l.kind, l.title, l.slug, l.url,
    l.short_description, l.long_description, l.location_name, l.is_remote,
    l.team_size, l.industry, l.subindustry, l.cost_type, l.is_recruiting,
    l.grade_min, l.grade_max, JSON.stringify(l.badges), l.status,
  ];
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
