import "server-only";
import { getPool } from "./db";
import type { ProfileInput } from "./schemas";

/**
 * Additively insert interest tags for a signed-in student without touching anything else on
 * their profile — used when a search discovers interests they haven't explicitly saved yet
 * (BUILD_PROMPT §6 "extremely smart and adaptive"). Never deletes; on-conflict no-ops.
 */
export async function addUserInterestTags(userId: string, tagSlugs: string[]): Promise<void> {
  if (tagSlugs.length === 0) return;
  const pool = getPool();
  if (!pool) throw new Error("No database configured.");

  const tags = await pool.query<{ id: number }>(
    `select id from interest_tags where slug = any($1::text[])`,
    [tagSlugs],
  );
  for (const t of tags.rows) {
    await pool.query(
      `insert into user_interest_tags (user_id, tag_id) values ($1,$2) on conflict do nothing`,
      [userId, t.id],
    );
  }
}

/**
 * Server-side profile persistence (BUILD_PROMPT §2c/§3). Writes grade/age/region + interest tags +
 * the SECRET personality vector/archetypes for a signed-in student. Uses the pg pool (privileged
 * connection). GUARDRAIL §0.1: the personality columns are WRITE-only for clients (the column
 * grants in 0003 have no SELECT), and this module never returns them — writes only.
 */
export async function saveProfile(userId: string, d: ProfileInput): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database configured.");

  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(
      `insert into profiles (id, grade, age, region, personality_vector, personality_archetypes)
       values ($1,$2,$3,$4,$5::vector,$6)
       on conflict (id) do update set
         grade = excluded.grade,
         age = excluded.age,
         region = excluded.region,
         personality_vector = coalesce(excluded.personality_vector, profiles.personality_vector),
         personality_archetypes = coalesce(excluded.personality_archetypes, profiles.personality_archetypes),
         updated_at = now()`,
      [
        userId,
        d.grade ?? null,
        d.age ?? null,
        d.region || null,
        d.personalityVector ? `[${d.personalityVector.join(",")}]` : null,
        d.personalityArchetypes ?? null,
      ],
    );

    // Replace the student's interest tags with the current selection.
    await client.query(`delete from user_interest_tags where user_id = $1`, [userId]);
    if (d.tagSlugs.length) {
      const tags = await client.query<{ id: number }>(
        `select id from interest_tags where slug = any($1::text[])`,
        [d.tagSlugs],
      );
      for (const t of tags.rows) {
        await client.query(
          `insert into user_interest_tags (user_id, tag_id) values ($1,$2) on conflict do nothing`,
          [userId, t.id],
        );
      }
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
