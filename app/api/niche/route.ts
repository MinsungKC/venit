import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cosine } from "@/lib/vec";
import { EMBEDDING_DIM } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Match a student's free-text niche interest to specific niche tags (BUILD_PROMPT §3 step 4).
 * The browser gets the phrase embedded via /api/embed and posts the VECTOR (not the raw text);
 * the server compares it to the 723 niche-tag vectors and returns the closest tags. Listings
 * carrying those niche tags are then matched + prioritized on /match. The niche-vectors file
 * stays server-side; only tag slugs come back.
 */
interface NicheVec {
  slug: string;
  label: string;
  vector: number[];
}
let vecs: NicheVec[] | null = null;
function load(): NicheVec[] {
  if (!vecs) {
    try {
      vecs = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "niche-vectors.json"), "utf8"));
    } catch {
      vecs = [];
    }
  }
  return vecs!;
}

const THRESHOLD = 0.5;
const TOP_K = 6;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const v = (body as { vector?: unknown })?.vector;
  if (!Array.isArray(v) || v.length !== EMBEDDING_DIM || !v.every((x) => typeof x === "number")) {
    return NextResponse.json({ error: `Expected a ${EMBEDDING_DIM}-dim vector.` }, { status: 400 });
  }

  const scored = load()
    .map((r) => ({ slug: r.slug, label: r.label, score: cosine(v as number[], r.vector) }))
    .sort((a, b) => b.score - a.score)
    .filter((s) => s.score >= THRESHOLD)
    .slice(0, TOP_K);

  return NextResponse.json({ tags: scored.map((t) => ({ slug: t.slug, label: t.label })) });
}
