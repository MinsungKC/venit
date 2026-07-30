/**
 * Source adapter: S&P 500 constituents (large, well-known companies) -> NormalizedListing[].
 * Vendored CSV at supabase/seed/source/sp500.csv (Open Data Commons PDDL; see README).
 *
 * The CSV has no descriptions or websites, but its GICS Sector + Sub-Industry make solid
 * interest tags, so these companies are matchable by sector immediately.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsvObjects } from "../csv";
import { truncate, type NormalizedListing } from "../mapping";

const SOURCE_PATH = join(process.cwd(), "supabase", "seed", "source", "sp500.csv");
const ENRICH_PATH = join(process.cwd(), "supabase", "seed", "source", "sp500-enrichment.json");

/** Website + description backfilled from Wikidata (see scripts/enrich-sp500.ts). */
export interface Sp500Enrichment {
  website?: string;
  description?: string;
}

export function mapSp500Row(
  row: Record<string, string>,
  enrich?: Sp500Enrichment,
): NormalizedListing | null {
  const title = row["Security"]?.trim();
  const symbol = row["Symbol"]?.trim();
  if (!title || !symbol) return null;

  const sector = row["GICS Sector"]?.trim() || null;
  const sub = row["GICS Sub-Industry"]?.trim() || null;
  const tag_labels = [sector, sub].filter((x): x is string => Boolean(x));
  const fallbackDesc = sub ? `${sector} · ${sub}` : sector;

  return {
    external_id: symbol,
    source: "sp500",
    kind: "company",
    title,
    slug: null,
    url: enrich?.website?.trim() || null,
    short_description: enrich?.description ? truncate(enrich.description, 300) : fallbackDesc,
    long_description: null,
    location_name: row["Headquarters Location"]?.trim() || null,
    is_remote: false,
    team_size: null,
    industry: sector,
    subindustry: sub,
    cost_type: "unknown",
    // Large public companies commonly run internships; not HS-specific, so we don't
    // assert active recruiting here (it's a display badge, never a filter anyway).
    is_recruiting: false,
    badges: ["large_company"],
    status: "approved",
    grade_min: null,
    grade_max: null,
    deadline: null,
    tag_labels,
  };
}

export function loadSp500Listings(): NormalizedListing[] {
  const rows = parseCsvObjects(readFileSync(SOURCE_PATH, "utf8"));
  const enrichment: Record<string, Sp500Enrichment> = existsSync(ENRICH_PATH)
    ? JSON.parse(readFileSync(ENRICH_PATH, "utf8"))
    : {};
  return rows
    .map((r) => mapSp500Row(r, enrichment[r["Symbol"]?.trim()]))
    .filter((l): l is NormalizedListing => l !== null && l.tag_labels.length > 0);
}
