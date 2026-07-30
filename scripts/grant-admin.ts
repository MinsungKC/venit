/**
 * Grant (or revoke) admin access for a signed-in user, by email — the `roles` table lib/admin.ts
 * checks (BUILD_PROMPT §4). The user must already exist in auth.users (i.e. have signed in via
 * magic link at least once); this never creates an account, only flips a role on an existing one.
 *
 *   npm run admin:grant -- someone@example.com          (grant)
 *   npm run admin:grant -- someone@example.com --revoke  (revoke)
 */
import "dotenv/config";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email) {
    console.error("Usage: npm run admin:grant -- <email> [--revoke]");
    process.exit(1);
  }
  const grant = flag !== "--revoke";

  const client = new Client({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    const user = await client.query<{ id: string }>(`select id from auth.users where email = $1`, [email]);
    if (user.rows.length === 0) {
      console.error(`No account for ${email} — they need to sign in (magic link) at least once first.`);
      process.exit(1);
    }
    const userId = user.rows[0].id;

    await client.query(
      `insert into roles (user_id, is_admin) values ($1, $2)
       on conflict (user_id) do update set is_admin = excluded.is_admin`,
      [userId, grant],
    );
    console.log(`${grant ? "Granted" : "Revoked"} admin for ${email} (${userId}).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
