/**
 * Generate many research groups (labs) per university from OpenAlex (CC0 open data).
 *
 *   npx tsx scripts/generate-university-labs.ts
 *   -> supabase/seed/source/university-labs.json
 *
 * For each university in universities.json we resolve its OpenAlex institution, then pull
 * disambiguated PIs (ORCID + a sane output band, so common-name merged profiles are
 * excluded) and turn each into a research-group listing tagged by research field/subfield,
 * located at the university (satisfies the research-lab location requirement, §0.5).
 *
 * These represent a PI's public research area from scholarly data — NOT a confirmation that
 * the lab accepts high-school students (is_recruiting stays false; the UI shows no status).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "supabase", "seed", "source", "university-labs.json");
const UNIS = join(process.cwd(), "supabase", "seed", "source", "universities.json");
const MAILTO = "youngimyoo@yahoo.com";
const LABS_PER_UNI = 75;

export interface UniversityLab {
  id: string; // OpenAlex author id
  name: string;
  url: string | null;
  university: string;
  location: string; // "City, Region"
  field: string | null;
  primary_topic: string | null;
  tags: string[];
}

interface OAInstitution {
  id: string;
  display_name: string;
  geo?: { city?: string; region?: string; country_code?: string };
}
interface OATopic {
  display_name: string;
  subfield?: { display_name?: string };
  field?: { display_name?: string };
}
interface OAAuthor {
  id: string;
  display_name: string;
  orcid?: string | null;
  topics?: OATopic[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": `OppMatch/0.1 (${MAILTO})` } });
  if (!res.ok) throw new Error(`OpenAlex ${res.status} ${url}`);
  return (await res.json()) as T;
}

async function resolveInstitution(name: string): Promise<OAInstitution | null> {
  const url =
    `https://api.openalex.org/institutions?search=${encodeURIComponent(name)}` +
    `&filter=country_code:US,type:education&per-page=1` +
    `&select=id,display_name,geo&mailto=${MAILTO}`;
  const j = await getJson<{ results: OAInstitution[] }>(url);
  return j.results[0] ?? null;
}

function tagsFromTopics(topics: OATopic[]): { tags: string[]; field: string | null; primary: string | null } {
  const tags = new Set<string>();
  let field: string | null = null;
  for (const t of topics.slice(0, 3)) {
    if (t.subfield?.display_name) tags.add(t.subfield.display_name);
    if (t.field?.display_name) {
      tags.add(t.field.display_name);
      if (!field) field = t.field.display_name;
    }
  }
  return { tags: [...tags].slice(0, 5), field, primary: topics[0]?.display_name ?? null };
}

async function labsForUniversity(uni: string): Promise<UniversityLab[]> {
  const inst = await resolveInstitution(uni);
  if (!inst) {
    console.warn(`  ! no OpenAlex match for ${uni}`);
    return [];
  }
  const instId = inst.id.replace("https://openalex.org/", "");
  const loc = [inst.geo?.city, inst.geo?.region].filter(Boolean).join(", ") || inst.display_name;

  const url =
    `https://api.openalex.org/authors?filter=last_known_institutions.id:${instId},` +
    `has_orcid:true,works_count:30-500&sort=cited_by_count:desc&per-page=${LABS_PER_UNI}` +
    `&select=id,display_name,orcid,topics&mailto=${MAILTO}`;
  const j = await getJson<{ results: OAAuthor[] }>(url);

  const labs: UniversityLab[] = [];
  for (const a of j.results) {
    const topics = a.topics ?? [];
    if (topics.length === 0) continue;
    const { tags, field, primary } = tagsFromTopics(topics);
    if (tags.length === 0) continue;
    labs.push({
      id: a.id.replace("https://openalex.org/", ""),
      name: a.display_name,
      url: a.orcid ?? null,
      university: inst.display_name,
      location: loc,
      field,
      primary_topic: primary,
      tags,
    });
  }
  return labs;
}

async function main() {
  const universities = JSON.parse(readFileSync(UNIS, "utf8")) as string[];
  const all: UniversityLab[] = [];
  for (const uni of universities) {
    try {
      const labs = await labsForUniversity(uni);
      all.push(...labs);
      console.log(`  ${uni}: ${labs.length} groups (total ${all.length})`);
    } catch (err) {
      console.warn(`  ${uni} failed: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  writeFileSync(OUT, JSON.stringify(all));
  console.log(`generate-university-labs — ${all.length} research groups across ${universities.length} universities.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
