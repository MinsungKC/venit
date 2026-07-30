import { NextResponse } from "next/server";
import { embedQuery } from "@/lib/embeddings";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Embed a short student-typed query server-side (BUILD_PROMPT §3) — the search bar, the
 * onboarding wizard's free-text interests, and adjectives all call this instead of running a
 * model in the browser. Self-hosted (BGE via transformers.js, lib/embeddings.ts), not a paid
 * third-party API, so this stays within the §0.7 cost-discipline guardrail; it just moved the
 * compute from the student's device to our own server for meaningfully better match quality.
 * Only the resulting vector is returned — the raw text is never stored or logged (§0.2/§0.3).
 */
const MAX_LEN = 500;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`embed:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Slow down a moment." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const text = (body as { text?: unknown })?.text;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Expected non-empty { text }." }, { status: 400 });
  }

  try {
    const vector = await embedQuery(text.trim().slice(0, MAX_LEN));
    return NextResponse.json({ vector });
  } catch {
    return NextResponse.json({ error: "Embedding failed." }, { status: 500 });
  }
}
