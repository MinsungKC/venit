/**
 * Geocode distinct research-lab locations to city-level coordinates via Nominatim (OpenStreetMap,
 * free, no key), so the "near me" radius filter is meaningful instead of state-centroid coarse
 * (BUILD_PROMPT §5). Only research_lab locations are geocoded — they're the only kind gated by
 * location (§0.5); companies/programs fall back to state centroids.
 *
 *   npm run data:geocode
 *   -> public/data/geocode.json   { "City, State": { lat, lng }, ... }   (committed, cached)
 *
 * Idempotent + resumable: re-running only fetches locations not already in the cache. Paced to
 * Nominatim's 1 req/sec policy with a hard timeout so a stuck request can't hang the run.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "data", "geocode.json");
const LISTINGS = join(process.cwd(), "public", "data", "listings.generated.json");
const MAILTO = "youngimyoo@yahoo.com";
const MIN_GAP_MS = 1100;
const TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let last = 0;
async function pace() {
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await Promise.race([
      fetch(url, { headers: { "User-Agent": `OppMatch/0.1 (${MAILTO})` }, signal: ac.signal }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("hard timeout")), TIMEOUT_MS + 5000)),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  await pace();
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const j = (await res.json()) as { lat: string; lon: string }[];
    if (!j[0]) return null;
    return { lat: Number(j[0].lat), lng: Number(j[0].lon) };
  } catch {
    return null;
  }
}

interface Listing {
  kind: string;
  location_name: string | null;
}

async function main() {
  const listings = JSON.parse(readFileSync(LISTINGS, "utf8")) as Listing[];
  const cities = [
    ...new Set(
      listings
        .filter((l) => l.kind === "research_lab" && l.location_name)
        .map((l) => l.location_name!.trim()),
    ),
  ];

  const cache: Record<string, { lat: number; lng: number }> = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf8"))
    : {};

  const todo = cities.filter((c) => !(c in cache));
  console.log(`geocode — ${cities.length} distinct lab cities, ${todo.length} to fetch`);

  let done = 0;
  for (const city of todo) {
    const geo = await geocode(city);
    if (geo) cache[city] = geo;
    done++;
    if (done % 10 === 0 || done === todo.length) {
      writeFileSync(OUT, JSON.stringify(cache));
      console.log(`  ${done}/${todo.length} (${Object.keys(cache).length} cached)`);
    }
  }
  writeFileSync(OUT, JSON.stringify(cache));
  console.log(`geocode — wrote ${Object.keys(cache).length} coordinates to public/data/geocode.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
