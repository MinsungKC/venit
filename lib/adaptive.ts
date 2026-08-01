import "server-only";
import { getPool } from "./db";
import { getDesiredVectors, getUserPersonalityVector } from "./personality-data";

/**
 * Engagement-driven profile adaptation (BUILD_PROMPT §6 "smart and adaptive"), computed at READ
 * time from the student's saved listings (the `stars` table already timestamps every save), so
 * there's no extra state to maintain and the model naturally DECAYS and FORGETS:
 *
 *   - INTEREST AFFINITY — each saved listing contributes `exp(-λ·age)` (a 45-day half-life) to
 *     each of its interest tags. Recent saves weigh heavily; old ones fade (that's the down-weight).
 *     These become per-tag ranking weights, and tags that clear a small floor are surfaced as
 *     DISCOVERED interests even if the student never typed them — until their affinity decays back
 *     below the floor, at which point they drop out (forgetting). Unsaving removes the row entirely.
 *
 *   - PERSONALITY DRIFT — the onboarding vector stays the ANCHOR; the live fit-ranking vector is a
 *     BOUNDED blend of the anchor toward the (decayed) mean desired-personality of saved listings.
 *     Drift is capped (`MAX_DRIFT`) and scales with engagement volume, so it tracks behavior without
 *     ever wandering far from who the student said they were. GUARDRAIL §0.1: this only READS the
 *     secret vector to compute a fresh one for ranking; nothing secret is written or returned raw.
 */

const HALF_LIFE_DAYS = 45;
const DECAY = Math.LN2 / HALF_LIFE_DAYS; // per-day exponential decay rate
const DAY_MS = 86_400_000;

// Interest weighting. A tag's ranking weight is 1 (neutral baseline) + AFFINITY_SCALE × its decayed
// engagement, capped so one obsession can't dominate. Non-engaged interests stay at the 1.0 baseline.
const AFFINITY_SCALE = 1.0;
const AFFINITY_CAP = 2.5; // max added weight → engaged tags reach ~3.5× a non-engaged interest
// A non-stated tag needs at least this much decayed affinity to count as a discovered interest.
// One fresh save = 1.0, so a save surfaces its tags immediately; they fade out after enough decay.
const DISCOVER_FLOOR = 0.15;

// Personality drift bounds (deliberately conservative — "don't drift too much").
const MAX_DRIFT = 0.22; // hard cap on how far toward engagement the live vector can move (0..1)
const DRIFT_K = 3; // engagement mass at which drift reaches half its cap (smaller = quicker to move)

export interface EngagementProfile {
  /** Interests surfaced purely from engagement (may overlap the student's stated interests). */
  discoveredSlugs: string[];
  /** slug → ranking weight (≥1). Only carries tags with engagement; others default to 1 in the engine. */
  tagWeights: Record<string, number>;
  /** The bounded, drifted personality vector for fit ranking (anchor when there's no engagement). */
  personalityVector: number[] | null;
}

function normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n);
  return n === 0 ? v : v.map((x) => x / n);
}

const EMPTY: EngagementProfile = { discoveredSlugs: [], tagWeights: {}, personalityVector: null };

/**
 * Build the engagement overlay for a signed-in student. Cheap (a couple of small queries scoped to
 * the user's own saves) and side-effect-free. Returns anchor-only / empty overlays when there's no
 * engagement or no DB.
 */
export async function getEngagementProfile(userId: string): Promise<EngagementProfile> {
  const pool = getPool();
  if (!pool) return { ...EMPTY };

  const now = Date.now();

  try {
    // Decayed affinity per interest tag, from the tags of every saved listing.
    const tagRows = await pool.query<{ slug: string; created_at: string }>(
      `select t.slug, s.created_at
         from stars s
         join listing_interest_tags lit on lit.listing_id = s.listing_id
         join interest_tags t on t.id = lit.tag_id
        where s.user_id = $1`,
      [userId],
    );

    const affinity = new Map<string, number>();
    for (const { slug, created_at } of tagRows.rows) {
      const ageDays = Math.max(0, (now - new Date(created_at).getTime()) / DAY_MS);
      affinity.set(slug, (affinity.get(slug) ?? 0) + Math.exp(-DECAY * ageDays));
    }

    const discoveredSlugs: string[] = [];
    const tagWeights: Record<string, number> = {};
    for (const [slug, a] of affinity) {
      if (a >= DISCOVER_FLOOR) discoveredSlugs.push(slug);
      tagWeights[slug] = 1 + AFFINITY_SCALE * Math.min(a, AFFINITY_CAP);
    }

    // Bounded personality drift toward the decayed mean desired-personality of saved listings.
    const anchor = await getUserPersonalityVector(userId);
    let personalityVector = anchor;
    if (anchor) {
      const listingRows = await pool.query<{ slug: string; created_at: string }>(
        `select l.slug, s.created_at
           from stars s
           join listings l on l.id = s.listing_id
          where s.user_id = $1`,
        [userId],
      );
      if (listingRows.rows.length) {
        const desiredBySlug = await getDesiredVectors();
        const accum = new Array<number>(anchor.length).fill(0);
        let mass = 0;
        for (const { slug, created_at } of listingRows.rows) {
          const d = desiredBySlug.get(slug);
          if (!d || d.length !== anchor.length) continue;
          const w = Math.exp(-DECAY * Math.max(0, (now - new Date(created_at).getTime()) / DAY_MS));
          for (let i = 0; i < d.length; i++) accum[i] += w * d[i];
          mass += w;
        }
        if (mass > 0) {
          const dir = normalize(accum);
          const beta = MAX_DRIFT * (mass / (mass + DRIFT_K)); // grows with engagement, capped
          personalityVector = normalize(anchor.map((x, i) => (1 - beta) * x + beta * dir[i]));
        }
      }
    }

    return { discoveredSlugs, tagWeights, personalityVector };
  } catch (err) {
    console.error("engagement profile error:", (err as Error).message);
    return { ...EMPTY };
  }
}
