/**
 * Pure helpers for the scheduled dead-link checker (BUILD_PROMPT §7 ★). No I/O here so the
 * status classification is unit-testable and importing this never triggers a network sweep.
 */

/**
 * Whether an HTTP status means the listing's link is genuinely dead (worth flagging for admin
 * review) — as opposed to merely bot-blocked or method-restricted. We flag ONLY high-confidence
 * dead signals so admins aren't flooded with false positives:
 *  - 404 / 410  → gone,
 *  - 5xx        → server broken.
 * We deliberately DON'T flag 401/403 (auth/bot walls), 405 (HEAD not allowed), 429 (rate limited),
 * or 2xx/3xx (fine). Network errors are reported separately, never auto-flagged (often transient).
 */
export function isDeadStatus(status: number): boolean {
  return status === 404 || status === 410 || status >= 500;
}

/** A stable de-dupe key for a URL (host + path, lowercased, no trailing slash), or null if unusable. */
export function urlKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.host.toLowerCase()}${path}`.toLowerCase();
  } catch {
    return null;
  }
}
