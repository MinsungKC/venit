/**
 * Shortlist ("star") core — pure and side-effect-free so it is unit-tested without a browser.
 * A shortlist is just an ordered list of listing slugs the student saved; the window/localStorage
 * glue lives in `lib/stars.ts`. No personality or PII is involved.
 */
import { parseTagParam } from "./matching";

/** Parse a `?items=` value (a shared read-only shortlist) into a clean slug list. */
export const parseItemsParam = parseTagParam;

/** Add the slug if absent, remove it if present. Returns a new array (never mutates). */
export function toggleSlug(current: string[], slug: string): string[] {
  return current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug];
}

/** Reorder `listings` to follow the saved slug order (items not found are skipped). */
export function orderBySlugs<T extends { slug: string }>(listings: T[], slugs: string[]): T[] {
  const bySlug = new Map(listings.map((l) => [l.slug, l]));
  return slugs.map((s) => bySlug.get(s)).filter((l): l is T => l !== undefined);
}
