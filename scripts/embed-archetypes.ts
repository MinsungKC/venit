/**
 * Precompute the 10 personality-archetype embeddings (BUILD_PROMPT §2b).
 *
 *   npm run data:personality
 *   -> public/data/archetype-vectors.json  [{ slug, label, vector[384] }]
 *
 * Each archetype's `anchor_text` (definition + synonym list) is embedded ONCE with the same
 * embedding model the server uses for a student's adjectives (lib/embeddings.ts / /api/embed),
 * so the personality classifier (§3) compares them in the identical 384-dim space.
 *
 * Build-time only — no per-request AI (guardrail §0.6). The resulting vectors are the
 * reference personalities used for ranking; they are never shown to a student (guardrail §0.1).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { embedBatch } from "../lib/embeddings";

const OUT_DIR = join(process.cwd(), "public", "data");
const PERSONALITY = join(process.cwd(), "supabase", "seed", "personality.json");

interface Archetype {
  slug: string;
  label: string;
  anchor_text: string;
}

async function main() {
  const archetypes = JSON.parse(readFileSync(PERSONALITY, "utf8")) as Archetype[];
  console.log(`embed-archetypes — ${archetypes.length} archetypes`);

  const vectors = await embedBatch(archetypes.map((a) => a.anchor_text));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "archetype-vectors.json"),
    JSON.stringify(archetypes.map((a, i) => ({ slug: a.slug, label: a.label, vector: vectors[i] }))),
  );
  console.log(`embed-archetypes — wrote ${archetypes.length} archetype vectors.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
