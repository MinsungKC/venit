/**
 * Scheduled dead-link checker (BUILD_PROMPT §7 ★). Sweeps listing URLs and files a `broken_link`
 * report (reason for admin review — never auto-deletes) for any that return 404/410/5xx. High-
 * confidence only (see lib/dead-links.isDeadStatus) so admins aren't flooded. Idempotent: skips
 * listings that already have an unresolved auto broken-link report.
 *
 *   npm run data:check-links               (expects DATABASE_URL)
 *   SAMPLE=200 npm run data:check-links     (quick run over the first 200 unique URLs)
 *
 * Polite: dedupes by URL, bounded concurrency, HEAD (GET fallback), short timeout. Build-time /
 * cron only — not the hot path (§0.7).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { isDeadStatus, urlKey } from "../lib/dead-links";
import type { ListingRecord } from "../lib/mapping";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const CONCURRENCY = 12;
const TIMEOUT_MS = 9_000;
const SAMPLE = process.env.SAMPLE ? Number(process.env.SAMPLE) : 0;
const AUTO_DETAIL = "auto: dead-link checker";

/** Fetch a URL's status (HEAD, then GET fallback). Returns null on a network error/timeout. */
async function statusOf(url: string): Promise<number | null> {
  for (const method of ["HEAD", "GET"] as const) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "user-agent": "OppMatch-LinkChecker/1.0 (+student opportunity aggregator)" },
      });
      clearTimeout(timer);
      // Some servers 405 a HEAD; retry as GET before giving up.
      if (method === "HEAD" && res.status === 405) continue;
      return res.status;
    } catch {
      clearTimeout(timer);
      if (method === "GET") return null; // both attempts failed → network error
    }
  }
  return null;
}

async function main() {
  const listings = JSON.parse(
    readFileSync(join(process.cwd(), "public", "data", "listings.generated.json"), "utf8"),
  ) as ListingRecord[];

  // One representative listing per unique URL (host+path) so we don't hit the same page repeatedly.
  const byKey = new Map<string, { url: string; slugs: string[] }>();
  for (const l of listings) {
    const key = urlKey(l.url);
    if (!key || !l.url) continue;
    const e = byKey.get(key) ?? { url: l.url, slugs: [] };
    e.slugs.push(l.slug);
    byKey.set(key, e);
  }
  let targets = [...byKey.values()];
  if (SAMPLE > 0) targets = targets.slice(0, SAMPLE);
  console.log(`data:check-links — checking ${targets.length} unique URLs across ${listings.length} listings…`);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const idBySlug = new Map(
      (await client.query<{ id: string; slug: string }>(`select id, slug from listings`)).rows.map((r) => [
        r.slug,
        r.id,
      ]),
    );
    // Skip listings that already have an OPEN auto broken-link report.
    const alreadyFlagged = new Set(
      (
        await client.query<{ slug: string }>(
          `select distinct slug from reports where reason='broken_link' and resolved=false and detail like $1`,
          [`${AUTO_DETAIL}%`],
        )
      ).rows.map((r) => r.slug),
    );

    let checked = 0;
    let networkErrors = 0;
    const deadSlugs: { slug: string; status: number }[] = [];

    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (t) => {
          const status = await statusOf(t.url);
          checked++;
          if (status == null) {
            networkErrors++;
            return;
          }
          if (isDeadStatus(status)) {
            for (const slug of t.slugs) deadSlugs.push({ slug, status });
          }
        }),
      );
      if (i % (CONCURRENCY * 25) === 0) console.log(`  checked ${Math.min(i + CONCURRENCY, targets.length)}/${targets.length}`);
    }

    // File reports for newly-dead listings (skip ones already flagged).
    let filed = 0;
    for (const { slug, status } of deadSlugs) {
      if (alreadyFlagged.has(slug)) continue;
      alreadyFlagged.add(slug); // don't double-file within this run either
      const listingId = idBySlug.get(slug) ?? null;
      await client.query(
        `insert into reports (listing_id, slug, reason, detail) values ($1,$2,'broken_link',$3)`,
        [listingId, slug, `${AUTO_DETAIL} (HTTP ${status})`],
      );
      filed++;
    }

    console.log(
      `data:check-links — checked ${checked} URLs; ${deadSlugs.length} dead listing links, ` +
        `filed ${filed} new report(s); ${networkErrors} network errors (not flagged).`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
