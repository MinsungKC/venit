/**
 * Source adapter: live internship / early-career postings pulled from public ATS boards
 * (Greenhouse, Lever, Ashby) by `scripts/generate-ats-jobs.ts` -> `opportunity` listings.
 * Vendored at supabase/seed/source/ats-jobs.json. If that snapshot hasn't been generated yet,
 * this returns [] (the file is optional — run `npm run data:jobs` to populate it).
 *
 * These carry a direct `apply_url`, a parsed `qualifications` snippet (stored as the long
 * description so the detail page can show "what's needed"), and an `age_min` when the posting
 * states one — which becomes a hard eligibility filter in matching (§0.6, item 4).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { truncate, type NormalizedListing } from "../mapping";

/** One vendored ATS posting (shape written by scripts/generate-ats-jobs.ts). */
export interface AtsJob {
  id: string;
  company_id: string;
  company_name: string;
  company_website: string | null;
  provider: string;
  title: string;
  apply_url: string;
  location_name: string | null;
  is_remote: boolean;
  department: string | null;
  qualifications: string | null;
  age_min: number | null;
  posted_at: string | null;
  tags: string[];
}

const SOURCE_PATH = join(process.cwd(), "supabase", "seed", "source", "ats-jobs.json");

export function mapAtsJob(j: AtsJob): NormalizedListing {
  const where = j.is_remote ? "Remote" : j.location_name ?? "";
  const short = `${j.title} at ${j.company_name}${where ? ` · ${where}` : ""}`;
  return {
    external_id: j.id,
    source: "ats",
    kind: "opportunity",
    title: `${j.title} — ${j.company_name}`,
    slug: `job-${j.company_id}-${j.id.split(":").pop()}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 80),
    url: j.company_website,
    short_description: truncate(short, 300),
    long_description: j.qualifications ?? null,
    location_name: j.is_remote ? null : j.location_name ?? null,
    is_remote: j.is_remote,
    team_size: null,
    industry: j.department ?? null,
    subindustry: null,
    cost_type: "paid", // internships/early-career roles are paid roles, not programs with a fee
    is_recruiting: true,
    badges: ["ats"],
    status: "approved",
    grade_min: null,
    grade_max: null,
    age_min: j.age_min ?? null,
    apply_url: j.apply_url,
    deadline: null,
    tag_labels: (j.tags ?? []).map((t) => t.trim()).filter(Boolean),
  };
}

export function loadAtsJobListings(): NormalizedListing[] {
  if (!existsSync(SOURCE_PATH)) return [];
  const data = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as AtsJob[];
  if (!Array.isArray(data)) return [];
  return data.map(mapAtsJob);
}
