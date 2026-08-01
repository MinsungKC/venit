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
 * Wipe a signed-in student's saved search — interest tags + grade/age/region + the SECRET
 * personality vector/archetypes — so "Reset form" in Settings sends them cleanly back through
 * onboarding. Keeps the profiles row itself (created at auth) but blanks its fields.
 */
export async function clearProfile(userId: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database configured.");

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`delete from user_interest_tags where user_id = $1`, [userId]);
    await client.query(
      `update profiles
          set grade = null, age = null, region = null,
              personality_vector = null, personality_archetypes = null, updated_at = now()
        where id = $1`,
      [userId],
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export interface SavedProfile {
  tagSlugs: string[];
  grade: number | null;
  age: number | null;
  region: string | null;
}

/**
 * Read a signed-in student's saved search profile — their interest tags + grade/age/region — so
 * pages like `/match` can render straight from the account instead of requiring everything in the
 * URL (BUILD_PROMPT §6). GUARDRAIL §0.1: this NEVER reads the personality columns; only the public
 * interest tags + eligibility fields, which are safe to surface. Returns null-ish empties when the
 * DB is unavailable or the student hasn't onboarded yet.
 */
export async function getUserProfile(userId: string): Promise<SavedProfile> {
  const pool = getPool();
  if (!pool) return { tagSlugs: [], grade: null, age: null, region: null };

  const [prof, tags] = await Promise.all([
    pool.query<{ grade: number | null; age: number | null; region: string | null }>(
      `select grade, age, region from profiles where id = $1`,
      [userId],
    ),
    pool.query<{ slug: string }>(
      `select t.slug
         from user_interest_tags ut
         join interest_tags t on t.id = ut.tag_id
        where ut.user_id = $1
        order by t.slug`,
      [userId],
    ),
  ]);

  const row = prof.rows[0];
  return {
    tagSlugs: tags.rows.map((r) => r.slug),
    grade: row?.grade ?? null,
    age: row?.age ?? null,
    region: row?.region ?? null,
  };
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
