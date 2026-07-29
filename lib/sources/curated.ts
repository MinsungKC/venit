/**
 * Source adapter: hand-curated research labs, university programs, and notable HS
 * internships (incl. ALERTCalifornia) -> NormalizedListing[].
 *
 * These are authored because no clean machine-readable dataset of HS-accessible research
 * labs exists. Each carries explicit interest tags, and every `research_lab` must have a
 * location (BUILD_PROMPT §0.5 — labs require in-person presence / location matching).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { truncate, type CostType, type ListingKind, type NormalizedListing } from "../mapping";

interface CuratedEntry {
  id: string;
  kind: ListingKind;
  title: string;
  url?: string | null;
  short_description?: string | null;
  location_name?: string | null;
  is_remote?: boolean;
  industry?: string | null;
  is_recruiting?: boolean;
  grade_min?: number | null;
  grade_max?: number | null;
  cost_type?: CostType;
  tags: string[];
}

const SOURCE_PATH = join(process.cwd(), "supabase", "seed", "curated-listings.json");

export function mapCuratedEntry(e: CuratedEntry): NormalizedListing {
  if (e.kind === "research_lab" && !e.location_name && !e.is_remote) {
    // Guardrail §0.5: a research lab needs a location (or explicit remote).
    throw new Error(`Curated research_lab "${e.id}" is missing a location.`);
  }
  return {
    external_id: e.id,
    source: "curated",
    kind: e.kind,
    title: e.title.trim(),
    slug: e.id,
    url: e.url?.trim() || null,
    short_description: e.short_description ? truncate(e.short_description, 300) : null,
    long_description: null,
    location_name: e.location_name?.trim() || null,
    is_remote: Boolean(e.is_remote),
    team_size: null,
    industry: e.industry?.trim() || null,
    subindustry: null,
    cost_type: e.cost_type ?? "unknown",
    is_recruiting: e.is_recruiting ?? true,
    badges: ["curated"],
    status: "approved",
    grade_min: e.grade_min ?? null,
    grade_max: e.grade_max ?? null,
    tag_labels: (e.tags ?? []).map((t) => t.trim()).filter(Boolean),
  };
}

export function loadCuratedListings(): NormalizedListing[] {
  const data = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as CuratedEntry[];
  if (!Array.isArray(data)) throw new Error("curated-listings.json is not an array");
  return data.map(mapCuratedEntry);
}
