import { NextResponse } from "next/server";
import { keywordSearchTagSlugs } from "@/lib/match-data";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plain-text search (SearchBar's default, non-AI mode): literal keyword match, no embedding
 * call — see lib/match-data.ts keywordSearchTagSlugs for how it finds tags from a listing name.
 */
const MAX_LEN = 200;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`kwsearch:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Slow down a moment." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const q = (body as { q?: unknown })?.q;
  if (typeof q !== "string" || !q.trim()) {
    return NextResponse.json({ error: "Expected non-empty { q }." }, { status: 400 });
  }
  const tagSlugs = keywordSearchTagSlugs(q.trim().slice(0, MAX_LEN));
  return NextResponse.json({ tagSlugs });
}
