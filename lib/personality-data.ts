import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "./db";

/**
 * Server-only personality data for fit ranking (BUILD_PROMPT §5). Reads the SECRET student vector
 * (service-side; never sent to the client) and builds each listing's desired-personality vector
 * from its archetypes. GUARDRAIL §0.1: these vectors are used ONLY to compute a coarse fit label
 * server-side — they never leave the server.
 */
const ARCHETYPE_VECTORS = join(process.cwd(), "public", "data", "archetype-vectors.json");

function archetypeVectorMap(): Map<string, number[]> {
  const rows = JSON.parse(readFileSync(ARCHETYPE_VECTORS, "utf8")) as { slug: string; vector: number[] }[];
  return new Map(rows.map((r) => [r.slug, r.vector]));
}

function normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n);
  return n === 0 ? v : v.map((x) => x / n);
}

/** The signed-in student's stored personality vector (or null). Service-side read only. */
export async function getUserPersonalityVector(userId: string): Promise<number[] | null> {
  const pool = getPool();
  if (!pool) return null;
  const r = await pool.query<{ v: string | null }>(
    `select personality_vector::text as v from profiles where id = $1`,
    [userId],
  );
  const raw = r.rows[0]?.v;
  if (!raw) return null;
  // pgvector renders as "[0.1,0.2,...]".
  return raw
    .slice(1, -1)
    .split(",")
    .map(Number);
}

let desiredCache: Map<string, number[]> | null = null;

/**
 * slug → desired-personality vector (mean of the listing's desired archetype vectors, normalized).
 * Cached for the process since it changes rarely. Empty if the DB is unavailable.
 */
export async function getDesiredVectors(): Promise<Map<string, number[]>> {
  if (desiredCache) return desiredCache;
  const pool = getPool();
  if (!pool) return (desiredCache = new Map());

  const archVecs = archetypeVectorMap();
  const dim = archVecs.values().next().value?.length ?? 384;

  const rows = await pool.query<{ slug: string; arch: string }>(
    `select l.slug, a.slug as arch
       from listing_desired_personality d
       join listings l on l.id = d.listing_id
       join personality_archetypes a on a.id = d.archetype_id
      where l.status = 'approved'`,
  );

  const sums = new Map<string, { sum: number[]; n: number }>();
  for (const { slug, arch } of rows.rows) {
    const v = archVecs.get(arch);
    if (!v) continue;
    const acc = sums.get(slug) ?? { sum: new Array<number>(dim).fill(0), n: 0 };
    for (let i = 0; i < dim; i++) acc.sum[i] += v[i];
    acc.n += 1;
    sums.set(slug, acc);
  }

  const map = new Map<string, number[]>();
  for (const [slug, { sum, n }] of sums) {
    map.set(slug, normalize(sum.map((x) => x / n)));
  }
  desiredCache = map;
  return map;
}
