/**
 * Seed representative desired-personality archetypes on listings by kind, so the personality fit
 * ranking (BUILD_PROMPT §5) has data to work with. Heuristic — a research lab tends to want
 * Analysts/Explorers, a company Builders/Leaders, etc. Real orgs set their own via registration,
 * so this ONLY fills listings that have none yet (org choices are preserved).
 *
 *   npm run data:seed-personality   (expects DATABASE_URL)
 */
import "dotenv/config";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** kind → the archetype slugs an org of that kind typically seeks. */
const BY_KIND: Record<string, string[]> = {
  research_lab: ["analyst", "explorer", "builder-maker"],
  company: ["builder-maker", "leader", "innovator-visionary"],
  program: ["collaborator", "creator", "analyst"],
  camp: ["creator", "explorer", "helper"],
  opportunity: ["communicator", "competitor", "leader"],
};

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    let total = 0;
    for (const [kind, archetypes] of Object.entries(BY_KIND)) {
      const res = await client.query(
        `insert into listing_desired_personality (listing_id, archetype_id)
         select l.id, a.id
           from listings l
           cross join personality_archetypes a
          where l.kind = $1 and l.status = 'approved' and a.slug = any($2::text[])
            and not exists (select 1 from listing_desired_personality d where d.listing_id = l.id)
         on conflict do nothing`,
        [kind, archetypes],
      );
      console.log(`  ${kind}: +${res.rowCount} desired-personality links`);
      total += res.rowCount ?? 0;
    }
    console.log(`data:seed-personality — inserted ${total} links.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
