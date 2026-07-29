/**
 * Source adapter: per-university research groups generated from OpenAlex (CC0)
 * -> NormalizedListing[] (kind = research_lab).
 *
 * Vendored snapshot at supabase/seed/source/university-labs.json (built by
 * scripts/generate-university-labs.ts). Each entry is a disambiguated PI's public research
 * area located at their university — it is NOT a claim that the lab accepts high schoolers,
 * so is_recruiting stays false and the UI shows no "accepting" status for these.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NormalizedListing } from "../mapping";

interface UniversityLab {
  id: string;
  name: string;
  url: string | null;
  university: string;
  location: string;
  field: string | null;
  primary_topic: string | null;
  tags: string[];
}

const SOURCE_PATH = join(process.cwd(), "supabase", "seed", "source", "university-labs.json");

export function mapUniversityLab(l: UniversityLab): NormalizedListing {
  const topic = l.primary_topic ? ` — ${l.primary_topic}` : "";
  return {
    external_id: l.id,
    source: "openalex",
    kind: "research_lab",
    title: l.name.trim(),
    slug: null,
    url: l.url?.trim() || null,
    short_description: `Research group at ${l.university}${topic}.`,
    long_description: null,
    location_name: l.location?.trim() || l.university,
    is_remote: false,
    team_size: null,
    industry: l.field || "Academic Research",
    subindustry: null,
    cost_type: "unknown",
    is_recruiting: false,
    badges: ["openalex", "research_group"],
    status: "approved",
    grade_min: null,
    grade_max: null,
    tag_labels: (l.tags ?? []).map((t) => t.trim()).filter(Boolean),
  };
}

export function loadUniversityLabListings(): NormalizedListing[] {
  if (!existsSync(SOURCE_PATH)) return [];
  const data = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as UniversityLab[];
  if (!Array.isArray(data)) throw new Error("university-labs.json is not an array");
  return data.map(mapUniversityLab);
}
