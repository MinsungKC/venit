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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "supabase", "seed", "source", "university-labs.json");
const UNIS = join(process.cwd(), "supabase", "seed", "source", "universities.json");
const DONE = OUT + ".done"; // newline-separated input names already processed (resume marker)
const REQUEST_TIMEOUT_MS = 30_000; // abort a stuck fetch so one bad host can't hang the run
const MAILTO = "youngimyoo@yahoo.com";
const LABS_PER_UNI = 120;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pace every request to ~1/sec so we stay under OpenAlex's burst limit and never 429.
const MIN_GAP_MS = 1100;
let lastRequest = 0;
async function pace() {
  const wait = lastRequest + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
}

/**
 * fetch with BOTH an AbortSignal and a hard race-timeout that rejects even if the abort fails to
 * interrupt a dead connection (observed to hang indefinitely otherwise). The leaked request, if
 * any, errors harmlessly later.
 */
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await Promise.race([
      fetch(url, { headers: { "User-Agent": `OppMatch/0.1 (${MAILTO})` }, signal: ac.signal }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`hard timeout after ${ms + 5000}ms`)), ms + 5000),
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Cap how long we'll honor a Retry-After. A rate-limited OpenAlex can return a very large value
// (its daily window); sleeping that long looks like a hang, so we cap and let retries give up
// instead — the run then skips the rest and can resume later once the limit resets.
const MAX_BACKOFF_MS = 30_000;

async function getJson<T>(url: string, attempt = 0): Promise<T> {
  if (process.env.TRACE) process.stderr.write(`  fetch> ${url.slice(0, 90)}\n`);
  await pace();
  let res: Response;
  try {
    res = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
  } catch (err) {
    // Network error or timeout: retry with backoff, then give up so the run continues.
    if (attempt >= 4) throw new Error(`OpenAlex fetch failed after retries: ${(err as Error).message}`);
    await sleep(Math.min(2000 * 2 ** attempt, MAX_BACKOFF_MS));
    return getJson<T>(url, attempt + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`OpenAlex ${res.status} after retries ${url}`);
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Math.min(retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt, MAX_BACKOFF_MS);
    await sleep(wait);
    return getJson<T>(url, attempt + 1);
  }
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

  // Resume: reload prior output + the set of already-processed universities so a restart skips
  // completed work instead of re-fetching (and re-appending duplicate) everything.
  const all: UniversityLab[] = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as UniversityLab[]) : [];
  const done = new Set<string>(
    existsSync(DONE) ? readFileSync(DONE, "utf8").split("\n").filter(Boolean) : [],
  );
  let processed = done.size;
  if (processed) console.log(`resuming — ${processed} universities already done, ${all.length} groups on disk`);

  for (const uni of universities) {
    if (done.has(uni)) continue;
    try {
      const labs = await labsForUniversity(uni);
      all.push(...labs);
      console.log(`  ${uni}: ${labs.length} groups (total ${all.length})`);
    } catch (err) {
      console.warn(`  ${uni} failed: ${(err as Error).message}`);
    }
    done.add(uni);
    processed++;
    // Checkpoint after each university so progress is pollable and partial runs persist.
    writeFileSync(OUT, JSON.stringify(all));
    writeFileSync(DONE, [...done].join("\n") + "\n");
    writeFileSync(OUT + ".progress", `${processed}/${universities.length} universities, ${all.length} groups\n`);
  }
  console.log(`generate-university-labs — ${all.length} research groups across ${processed} universities.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
