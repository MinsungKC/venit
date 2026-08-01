/**
 * Generate high-school-accessible volunteering/discovery listings from OpenStreetMap (CC0, no key)
 * via the Overpass API: science centers, science museums, planetariums, aquariums, and zoos across
 * the US — the "Discovery Cube" archetype, places a student can actually visit and volunteer at.
 *
 *   npm run data:osm  ->  supabase/seed/osm-volunteering.json
 *
 * Each is normalized in lib/sources/osmVolunteering.ts to the `volunteer` kind and tagged with
 * canonical taxonomy labels (so it matches student interests directly, no re-embedding needed).
 * Resilient: hard request timeout + a mirror fallback; writes whatever it successfully fetched.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "supabase", "seed", "osm-volunteering.json");

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Bounded, HS-relevant categories (each inherently small vs. "all museums").
const QUERY = `
[out:json][timeout:150];
area["ISO3166-1"="US"]->.us;
(
  nwr["tourism"="museum"]["museum"="science"](area.us);
  nwr["tourism"="science_centre"](area.us);
  nwr["amenity"="planetarium"](area.us);
  nwr["tourism"="aquarium"](area.us);
  nwr["tourism"="zoo"](area.us);
);
out center tags;
`;

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OsmEntry {
  id: string;
  name: string;
  url: string | null;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  tags: string[];
}

/** Map an element's OSM tags to canonical taxonomy labels (must match taxonomy.json exactly). */
function canonicalTags(t: Record<string, string>): string[] {
  const out = new Set<string>(["Nonprofit & Community", "Education & Teaching"]);
  const museum = t["museum"];
  if (t["tourism"] === "aquarium") {
    out.add("Marine & Ocean Science");
    out.add("Biology");
  }
  if (t["tourism"] === "zoo") {
    out.add("Veterinary & Animal Science");
    out.add("Biology");
  }
  if (t["amenity"] === "planetarium") {
    out.add("Astronomy & Astrophysics");
    out.add("Physics");
  }
  if (t["tourism"] === "science_centre" || museum === "science") {
    out.add("Physics");
    out.add("Space Exploration");
    out.add("Astronomy & Astrophysics");
  }
  if (museum === "natural_history") {
    out.add("Biology");
    out.add("Ecology & Evolution");
  }
  return [...out];
}

async function run(endpoint: string): Promise<OsmElement[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 170_000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        // Overpass front-ends 406/403 requests without a real UA; identify ourselves politely.
        "user-agent": "OppMatch/1.0 (high-school opportunity matcher; contact: oppmatch)",
        accept: "application/json",
      },
      body: `data=${encodeURIComponent(QUERY)}`,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { elements?: OsmElement[] };
    return json.elements ?? [];
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  let elements: OsmElement[] = [];
  for (const ep of ENDPOINTS) {
    try {
      process.stdout.write(`osm — querying ${ep} …\n`);
      elements = await run(ep);
      if (elements.length) break;
    } catch (err) {
      process.stdout.write(`  failed: ${(err as Error).message}\n`);
    }
  }

  const seen = new Set<string>();
  const entries: OsmEntry[] = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    const name = t["name"]?.trim();
    if (!name) continue;
    const lat = el.lat ?? el.center?.lat ?? null;
    const lng = el.lon ?? el.center?.lon ?? null;
    const city = t["addr:city"]?.trim();
    const state = t["addr:state"]?.trim();
    const location = [city, state].filter(Boolean).join(", ") || null;
    const dedupKey = `${name.toLowerCase()}|${(city ?? "").toLowerCase()}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    entries.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      url: (t["website"] ?? t["contact:website"] ?? t["url"] ?? null)?.trim() || null,
      location_name: location,
      lat,
      lng,
      tags: canonicalTags(t),
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(OUT, JSON.stringify(entries, null, 0));
  process.stdout.write(`osm — wrote ${entries.length} volunteering listings to ${OUT}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
