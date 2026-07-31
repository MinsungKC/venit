/**
 * Source adapter: hand-curated volunteering opportunities open to high-schoolers -> the new
 * `volunteer` listing kind. Vendored at supabase/seed/volunteering.json.
 *
 * These are national organizations / programs (local chapters, virtual roles, service clubs)
 * rather than a scraped feed — no clean machine-readable dataset of teen-accessible volunteering
 * exists. All are free (`cost_type: "free"`) and actively accepting volunteers. Age minimums are
 * set only where an org states one (e.g. crisis lines require 18+); otherwise left null.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { truncate, type NormalizedListing } from "../mapping";

export interface VolunteerEntry {
  id: string;
  name: string;
  url?: string | null;
  short_description?: string | null;
  location_name?: string | null;
  is_remote?: boolean;
  age_min?: number | null;
  grade_min?: number | null;
  grade_max?: number | null;
  tags: string[];
}

const SOURCE_PATH = join(process.cwd(), "supabase", "seed", "volunteering.json");

export function mapVolunteerEntry(e: VolunteerEntry): NormalizedListing {
  return {
    external_id: e.id,
    source: "volunteering",
    kind: "volunteer",
    title: e.name.trim(),
    slug: e.id,
    url: e.url?.trim() || null,
    short_description: e.short_description ? truncate(e.short_description, 300) : null,
    long_description: null,
    location_name: e.location_name?.trim() || null,
    is_remote: Boolean(e.is_remote),
    team_size: null,
    industry: "Volunteering",
    subindustry: null,
    cost_type: "free",
    is_recruiting: true,
    badges: ["curated", "volunteer"],
    status: "approved",
    grade_min: e.grade_min ?? null,
    grade_max: e.grade_max ?? null,
    age_min: e.age_min ?? null,
    deadline: null,
    tag_labels: (e.tags ?? []).map((t) => t.trim()).filter(Boolean),
  };
}

export function loadVolunteerListings(): NormalizedListing[] {
  const data = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as VolunteerEntry[];
  if (!Array.isArray(data)) throw new Error("volunteering.json is not an array");
  return data.map(mapVolunteerEntry);
}
