/**
 * Import every source (yc, S&P 500, curated, OpenAlex) into Postgres (local Supabase by
 * default; a hosted project via DATABASE_URL). Idempotent: upserts interest tags, personality
 * archetypes, and listings, and re-links tags each run.
 *
 *   npm run db:import        (expects DATABASE_URL, defaults to local Supabase)
 *
 * Uses node-postgres directly (no RLS/service keys needed). Inserts are BULK via `unnest`
 * array parameters, chunked, inside a single transaction — this collapses tens of thousands of
 * round-trips into a few dozen, which matters against a remote DB (row-by-row was ~84 min for
 * ~39k listings at 43 ms RTT; bulk is seconds). The "approved needs >=1 tag" trigger (migration
 * 0001) is `deferrable initially deferred`, so it validates once at COMMIT after tags are linked.
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { loadAllListings } from "../lib/sources";
import { buildDataset, type ListingRecord } from "../lib/mapping";
import { applyClassification, applyTaxonomyDomains } from "../lib/classification";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Chunk sizes keep each array parameter well under Postgres limits and memory modest.
const LISTING_CHUNK = 2000;
const PAIR_CHUNK = 20000;

async function main() {
  const built = buildDataset(applyClassification(loadAllListings()));
  const listings = built.listings;
  const tags = applyTaxonomyDomains(built.tags);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await seedArchetypes(client);
    const tagId = await upsertTags(client, tags);

    await client.query("begin");
    let inserted = 0;
    try {
      const idBySrcExt = await upsertListings(client, listings, (n) => (inserted += n));
      await linkTags(client, listings, tagId, idBySrcExt);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    }

    const bySource = new Map<string, number>();
    for (const l of listings) bySource.set(l.source, (bySource.get(l.source) ?? 0) + 1);
    console.log(
      `db:import — ${listings.length} listings upserted (${inserted} new); ${tags.length} tags; ` +
        `sources ${[...bySource].map(([s, n]) => `${s}:${n}`).join(" ")}.`,
    );
  } finally {
    await client.end();
  }
}

/** Bulk-upsert the interest-tag vocabulary; returns slug -> id (id is a bigint string). */
async function upsertTags(client: Client, tags: ReturnType<typeof buildDataset>["tags"]) {
  const res = await client.query<{ id: string; slug: string }>(
    `insert into interest_tags (slug, label, domain, is_niche, status)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::boolean[], $5::text[])
     on conflict (slug) do update set label = excluded.label, domain = excluded.domain
     returning id, slug`,
    [
      tags.map((t) => t.slug),
      tags.map((t) => t.label),
      tags.map((t) => t.domain),
      tags.map((t) => t.is_niche),
      tags.map((t) => t.status),
    ],
  );
  const map = new Map<string, string>();
  for (const r of res.rows) map.set(r.slug, r.id);
  return map;
}

/**
 * Bulk-upsert listings in chunks via `unnest`. Returns "source:external_id" -> id so tag links
 * can be attached. `onInserted` is called per chunk with how many rows were newly inserted
 * (`xmax = 0` marks an insert vs. an update).
 */
async function upsertListings(
  client: Client,
  listings: ListingRecord[],
  onInserted: (n: number) => void,
) {
  const idBySrcExt = new Map<string, string>();
  for (let i = 0; i < listings.length; i += LISTING_CHUNK) {
    const chunk = listings.slice(i, i + LISTING_CHUNK);
    const res = await client.query<{
      id: string;
      source: string;
      external_id: string;
      inserted: boolean;
    }>(
      `insert into listings (
         external_id, source, kind, title, slug, url,
         short_description, long_description, location_name, is_remote,
         team_size, industry, subindustry, cost_type, is_recruiting,
         grade_min, grade_max, badges, status, application_deadline
       )
       select external_id, source::listing_source, kind::listing_kind, title, slug, url,
         short_description, long_description, location_name, is_remote,
         team_size, industry, subindustry, cost_type::cost_type, is_recruiting,
         grade_min, grade_max, badges::jsonb, status::listing_status, application_deadline::date
       from unnest(
         $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
         $7::text[], $8::text[], $9::text[], $10::boolean[],
         $11::int[], $12::text[], $13::text[], $14::text[], $15::boolean[],
         $16::int[], $17::int[], $18::text[], $19::text[], $20::text[]
       ) as t(
         external_id, source, kind, title, slug, url,
         short_description, long_description, location_name, is_remote,
         team_size, industry, subindustry, cost_type, is_recruiting,
         grade_min, grade_max, badges, status, application_deadline
       )
       on conflict (source, external_id) do update set
         kind = excluded.kind, title = excluded.title, url = excluded.url,
         short_description = excluded.short_description, long_description = excluded.long_description,
         location_name = excluded.location_name, is_remote = excluded.is_remote,
         team_size = excluded.team_size, industry = excluded.industry,
         subindustry = excluded.subindustry, cost_type = excluded.cost_type,
         is_recruiting = excluded.is_recruiting, grade_min = excluded.grade_min,
         grade_max = excluded.grade_max, badges = excluded.badges, status = excluded.status,
         application_deadline = excluded.application_deadline
       returning id, source, external_id, (xmax = 0) as inserted`,
      columnArrays(chunk),
    );
    let newRows = 0;
    for (const r of res.rows) {
      idBySrcExt.set(`${r.source}:${r.external_id}`, r.id);
      if (r.inserted) newRows++;
    }
    onInserted(newRows);
  }
  return idBySrcExt;
}

/** Re-link listing tags: clear existing links for these listings, then bulk-insert the pairs. */
async function linkTags(
  client: Client,
  listings: ListingRecord[],
  tagId: Map<string, string>,
  idBySrcExt: Map<string, string>,
) {
  const listingIds: string[] = [];
  const pairListing: string[] = [];
  const pairTag: string[] = [];
  for (const l of listings) {
    const lid = idBySrcExt.get(`${l.source}:${l.external_id}`);
    if (lid == null) continue;
    listingIds.push(lid);
    for (const slug of l.tag_slugs) {
      const tid = tagId.get(slug);
      if (tid != null) {
        pairListing.push(lid);
        pairTag.push(tid);
      }
    }
  }

  // Idempotency: drop existing links for the listings we just upserted (no-op on a fresh DB).
  for (let i = 0; i < listingIds.length; i += PAIR_CHUNK) {
    await client.query(`delete from listing_interest_tags where listing_id = any($1::bigint[])`, [
      listingIds.slice(i, i + PAIR_CHUNK),
    ]);
  }

  for (let i = 0; i < pairListing.length; i += PAIR_CHUNK) {
    await client.query(
      `insert into listing_interest_tags (listing_id, tag_id)
       select * from unnest($1::bigint[], $2::bigint[])
       on conflict do nothing`,
      [pairListing.slice(i, i + PAIR_CHUNK), pairTag.slice(i, i + PAIR_CHUNK)],
    );
  }
}

/** The 20 per-column arrays a listings chunk contributes to the `unnest` upsert, in column order. */
function columnArrays(chunk: ListingRecord[]) {
  return [
    chunk.map((l) => l.external_id),
    chunk.map((l) => l.source),
    chunk.map((l) => l.kind),
    chunk.map((l) => l.title),
    chunk.map((l) => l.slug),
    chunk.map((l) => l.url),
    chunk.map((l) => l.short_description),
    chunk.map((l) => l.long_description),
    chunk.map((l) => l.location_name),
    chunk.map((l) => l.is_remote),
    chunk.map((l) => l.team_size),
    chunk.map((l) => l.industry),
    chunk.map((l) => l.subindustry),
    chunk.map((l) => l.cost_type),
    chunk.map((l) => l.is_recruiting),
    chunk.map((l) => l.grade_min),
    chunk.map((l) => l.grade_max),
    chunk.map((l) => JSON.stringify(l.badges)),
    chunk.map((l) => l.status),
    chunk.map((l) => l.deadline),
  ];
}

/**
 * Seed the fixed personality-archetype taxonomy (supabase/seed/personality.json) and, when
 * present, its precomputed embeddings (public/data/archetype-vectors.json from
 * `npm run data:personality`). Idempotent upsert by slug. These vectors are ranking inputs
 * only — guardrail §0.1 keeps them service-side (see 0003_profiles.sql column grants).
 */
async function seedArchetypes(client: Client) {
  const seedPath = join(process.cwd(), "supabase", "seed", "personality.json");
  const vecPath = join(process.cwd(), "public", "data", "archetype-vectors.json");

  const archetypes = JSON.parse(readFileSync(seedPath, "utf8")) as {
    slug: string;
    label: string;
    description: string;
    anchor_text: string;
  }[];

  const vectorBySlug = new Map<string, number[]>();
  if (existsSync(vecPath)) {
    const rows = JSON.parse(readFileSync(vecPath, "utf8")) as { slug: string; vector: number[] }[];
    for (const r of rows) vectorBySlug.set(r.slug, r.vector);
  }

  for (const a of archetypes) {
    const vec = vectorBySlug.get(a.slug);
    await client.query(
      `insert into personality_archetypes (slug, label, description, anchor_text, embedding)
       values ($1,$2,$3,$4,$5::vector)
       on conflict (slug) do update set
         label = excluded.label, description = excluded.description,
         anchor_text = excluded.anchor_text,
         embedding = coalesce(excluded.embedding, personality_archetypes.embedding)`,
      [a.slug, a.label, a.description, a.anchor_text, vec ? `[${vec.join(",")}]` : null],
    );
  }

  const withVecs = archetypes.filter((a) => vectorBySlug.has(a.slug)).length;
  console.log(`db:import — seeded ${archetypes.length} personality archetypes (${withVecs} with vectors).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
