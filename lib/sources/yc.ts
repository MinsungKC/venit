/**
 * Source adapter: yc-oss company dataset -> NormalizedListing[].
 * Vendored snapshot at supabase/seed/source/yc-companies.json (see README for attribution).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  locationName,
  truncate,
  type NormalizedListing,
} from "../mapping";

export interface YcCompany {
  id: number;
  name: string;
  slug: string;
  website?: string | null;
  one_liner?: string | null;
  long_description?: string | null;
  team_size?: number | null;
  all_locations?: string | null;
  industry?: string | null;
  subindustry?: string | null;
  tags?: string[] | null;
  regions?: string[] | null;
  status?: string | null;
  isHiring?: boolean | null;
  top_company?: boolean | null;
  nonprofit?: boolean | null;
}

const SOURCE_PATH = join(process.cwd(), "supabase", "seed", "source", "yc-companies.json");

/** yc statuses we treat as dead and exclude entirely. */
const DEAD_STATUSES = new Set(["Inactive", "Dead"]);

function isRemote(c: YcCompany): boolean {
  if ((c.regions ?? []).some((r) => /remote/i.test(r))) return true;
  return /\bremote\b/i.test(c.all_locations ?? "");
}

function badgesFor(c: YcCompany): string[] {
  const b: string[] = [];
  if (c.top_company) b.push("top_company");
  if (c.nonprofit) b.push("nonprofit");
  return b;
}

export function mapYcCompany(c: YcCompany): NormalizedListing {
  return {
    external_id: String(c.id),
    source: "yc",
    kind: "company",
    title: c.name.trim(),
    slug: c.slug?.trim() || null,
    url: c.website?.trim() || null,
    short_description: c.one_liner ? truncate(c.one_liner, 300) : null,
    long_description: c.long_description?.trim() || null,
    location_name: locationName(c.all_locations),
    is_remote: isRemote(c),
    team_size: typeof c.team_size === "number" && c.team_size > 0 ? c.team_size : null,
    industry: c.industry?.trim() || null,
    subindustry:
      c.subindustry?.replace(/^.*->\s*/, "").trim() || c.subindustry?.trim() || null,
    cost_type: "unknown",
    is_recruiting: Boolean(c.isHiring),
    badges: badgesFor(c),
    status: "approved",
    grade_min: null,
    grade_max: null,
    deadline: null,
    tag_labels: (c.tags ?? []).map((t) => t.trim()).filter(Boolean),
  };
}

export function loadYcListings(): NormalizedListing[] {
  const data = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as YcCompany[];
  if (!Array.isArray(data)) throw new Error("yc-companies.json is not an array");
  return data
    .filter((c) => c && c.name && c.status != null && !DEAD_STATUSES.has(c.status))
    .map(mapYcCompany);
}
