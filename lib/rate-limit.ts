import "server-only";

/**
 * Dead-simple in-memory rate limiter (BUILD_PROMPT §4/§8 "rate-limit registration & report
 * endpoints"). Per-key sliding window; resets on server restart. Good enough for basic anti-spam
 * on a free tier — swap for a durable store (e.g. Supabase/Upstash) if abuse becomes real.
 */
const hits = new Map<string, number[]>();

/** Returns true if the action is allowed (and records it); false if the key is over its limit. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
