/**
 * Interest matching (pure, side-effect-free so it is unit-tested without a DB).
 *
 * Enforces BUILD_PROMPT guardrail §4: a listing may be shown to a user only if it shares
 * >= 1 of the user's *interest* tags. Personality is NEVER a factor here — it exists only to
 * reorder already-eligible results, and no personality data flows through this module.
 *
 * When the user has selected no interests we are in "browse" mode (not a matched profile),
 * so the full set is returned unchanged.
 */

/** Parse a comma-separated `?tags=` value into a clean, de-duplicated slug list. */
export function parseTagParam(raw?: string | string[] | null): string[] {
  if (!raw) return [];
  const joined = Array.isArray(raw) ? raw.join(",") : raw;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of joined.split(",")) {
    const slug = part.trim().toLowerCase();
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}

/** Interest-tag slugs a listing shares with the user's selection (keeps the listing's order). */
export function sharedTagSlugs(
  listingTagSlugs: string[],
  selected: ReadonlySet<string>,
): string[] {
  return listingTagSlugs.filter((s) => selected.has(s));
}

/**
 * Annotate each listing with how many interest tags it shares with the user's selection.
 * With a non-empty selection this also DROPS listings that share none (guardrail §4). With an
 * empty selection every listing is kept with `shared: 0` (browse mode — order untouched).
 */
export function matchByInterest<T extends { tag_slugs: string[] }>(
  listings: T[],
  selectedSlugs: string[],
): (T & { shared: number })[] {
  const selected = new Set(selectedSlugs);
  if (selected.size === 0) return listings.map((l) => ({ ...l, shared: 0 }));
  const out: (T & { shared: number })[] = [];
  for (const l of listings) {
    const shared = sharedTagSlugs(l.tag_slugs, selected).length;
    if (shared > 0) out.push({ ...l, shared });
  }
  return out;
}
