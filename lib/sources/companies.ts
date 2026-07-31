/**
 * Source adapter: hand-curated companies (niche tech + notable general/private companies that
 * aren't in the YC or S&P 500 sets) -> NormalizedListing[]. Vendored at
 * supabase/seed/companies.json. Each entry may also carry an `ats` board token, which the
 * `generate-ats-jobs` script uses to pull that company's live job/internship postings (item 4);
 * the token is ignored here — this adapter only emits the company itself.
 *
 * Cross-source duplicates (a company already present via YC/S&P) are collapsed by buildDataset's
 * company dedup, so overlap here is harmless.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { truncate, type NormalizedListing } from "../mapping";

export interface CompanyEntry {
  id: string;
  name: string;
  website?: string | null;
  industry?: string | null;
  short_description?: string | null;
  is_recruiting?: boolean;
  ats?: { provider: "greenhouse" | "lever" | "ashby"; token: string } | null;
  tags: string[];
}

const SOURCE_PATH = join(process.cwd(), "supabase", "seed", "companies.json");

export function mapCompanyEntry(e: CompanyEntry): NormalizedListing {
  return {
    external_id: e.id,
    source: "companies",
    kind: "company",
    title: e.name.trim(),
    slug: e.id,
    url: e.website?.trim() || null,
    short_description: e.short_description ? truncate(e.short_description, 300) : null,
    long_description: null,
    location_name: null,
    is_remote: false,
    team_size: null,
    industry: e.industry?.trim() || null,
    subindustry: null,
    cost_type: "unknown",
    is_recruiting: e.is_recruiting ?? false,
    // NB: no "curated" badge — these are adult companies in the directory, not HS-accessible
    // opportunities. The "curated" badge specifically marks hand-picked HS programs (see
    // isHsAccessible in match-data.ts), so tagging companies with it would wrongly boost them.
    badges: [],
    status: "approved",
    grade_min: null,
    grade_max: null,
    deadline: null,
    tag_labels: (e.tags ?? []).map((t) => t.trim()).filter(Boolean),
  };
}

export function loadCompanyListings(): NormalizedListing[] {
  const data = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as CompanyEntry[];
  if (!Array.isArray(data)) throw new Error("companies.json is not an array");
  return data.map(mapCompanyEntry);
}

/** The ATS boards to fetch job postings from — every company entry that declares one. */
export function loadAtsBoards(): { id: string; name: string; website: string | null; provider: string; token: string; industry: string | null; tags: string[] }[] {
  const data = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as CompanyEntry[];
  return data
    .filter((e): e is CompanyEntry & { ats: NonNullable<CompanyEntry["ats"]> } => Boolean(e.ats?.token))
    .map((e) => ({
      id: e.id,
      name: e.name,
      website: e.website?.trim() || null,
      provider: e.ats.provider,
      token: e.ats.token,
      industry: e.industry?.trim() || null,
      tags: e.tags ?? [],
    }));
}
