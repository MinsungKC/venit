/**
 * Derive REAL per-listing desired-personality from each listing's own text (BUILD_PROMPT §5) —
 * replacing the crude by-kind heuristic in seed-desired-personality.ts. For each listing we embed
 * its title + description with the same BGE model the student side uses, classify it against the 10
 * archetype vectors, and store its top-N archetypes as `listing_desired_personality` links. Fit
 * then becomes "your self-described personality aligns with this opportunity's actual character,"
 * which is earned signal rather than a blanket kind rule.
 *
 *   npm run data:listing-personality        (embeds all listings; expects DATABASE_URL)
 *   SAMPLE=50 npm run data:listing-personality   (quick smoke test on the first 50)
 *
 * GUARDRAIL §0.1: these vectors are ranking inputs only; the archetype links never reach a student
 * (personality-data.ts reads them service-side to compute the coarse fit label). Org self-
 * submissions (source='self_registered') are left untouched so an org's own chosen traits win.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { embedBatch } from "../lib/embeddings";
import { classifyPersonality } from "../lib/classifier";
import type { ArchetypeVector } from "../lib/match-types";
import type { ListingRecord } from "../lib/mapping";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const BATCH = 32;
const TOP_N = 3;
const SAMPLE = process.env.SAMPLE ? Number(process.env.SAMPLE) : 0;

/** The passage we characterize: title + short + long description (BGE passage side, no prefix). */
function listingText(l: ListingRecord): string {
  return [l.title, l.short_description, l.long_description].filter(Boolean).join(". ").slice(0, 480);
}

async function main() {
  const archetypes = JSON.parse(
    readFileSync(join(process.cwd(), "public", "data", "archetype-vectors.json"), "utf8"),
  ) as ArchetypeVector[];
  let listings = JSON.parse(
    readFileSync(join(process.cwd(), "public", "data", "listings.generated.json"), "utf8"),
  ) as ListingRecord[];
  if (SAMPLE > 0) listings = listings.slice(0, SAMPLE);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // DB listing ids by (source, external_id) — seed listings only (org submissions keep their own).
    const idRes = await client.query<{ id: string; source: string; external_id: string }>(
      `select id, source::text as source, external_id from listings where source::text <> 'self_registered'`,
    );
    const idByKey = new Map(idRes.rows.map((r) => [`${r.source}:${r.external_id}`, r.id]));
    const archIdBySlug = new Map(
      (await client.query<{ id: string; slug: string }>(`select id, slug from personality_archetypes`)).rows.map(
        (r) => [r.slug, r.id],
      ),
    );

    const derived: { listingId: string; archIds: string[] }[] = [];
    for (let i = 0; i < listings.length; i += BATCH) {
      const chunk = listings.slice(i, i + BATCH);
      const vecs = await embedBatch(chunk.map(listingText));
      chunk.forEach((l, k) => {
        const lid = idByKey.get(`${l.source}:${l.external_id}`);
        if (!lid) return; // not in DB (or an org submission we skip)
        const { archetypes: top } = classifyPersonality(vecs[k], archetypes, { topN: TOP_N });
        const archIds = top.map((s) => archIdBySlug.get(s)).filter((x): x is string => Boolean(x));
        if (archIds.length) derived.push({ listingId: lid, archIds });
      });
      if (i % (BATCH * 25) === 0) console.log(`  embedded ${Math.min(i + BATCH, listings.length)}/${listings.length}`);
    }

    // Replace derived listings' links (drops the old by-kind synthetic) then bulk-insert real ones.
    await client.query("begin");
    try {
      const lids = derived.map((d) => d.listingId);
      for (let i = 0; i < lids.length; i += 5000) {
        await client.query(`delete from listing_desired_personality where listing_id = any($1::bigint[])`, [
          lids.slice(i, i + 5000),
        ]);
      }
      const pl: string[] = [];
      const pa: string[] = [];
      for (const d of derived) for (const a of d.archIds) { pl.push(d.listingId); pa.push(a); }
      for (let i = 0; i < pl.length; i += 20000) {
        await client.query(
          `insert into listing_desired_personality (listing_id, archetype_id)
           select * from unnest($1::bigint[], $2::bigint[]) on conflict do nothing`,
          [pl.slice(i, i + 20000), pa.slice(i, i + 20000)],
        );
      }
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    }

    console.log(`data:listing-personality — derived real desired-personality for ${derived.length} listings.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
