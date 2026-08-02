import { config } from "dotenv";
import { Pool } from "pg";

config();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("supabase.com") ? { rejectUnauthorized: false } : false,
});

async function main() {
  const res = await pool.query(
    `select l.id, l.title, l.slug, l.kind, l.source, l.status, l.badges,
            coalesce(array_agg(t.label order by t.label) filter (where t.label is not null), '{}') as tags
       from listings l
       left join listing_interest_tags lit on lit.listing_id = l.id
       left join interest_tags t on t.id = lit.tag_id
      where l.status = 'approved' and l.source::text in ('self_registered', 'admin')
      group by l.id
      order by l.id desc
      limit 20`,
  );
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
