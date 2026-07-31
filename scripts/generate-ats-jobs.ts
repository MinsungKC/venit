/**
 * Generate live internship / early-career job postings from LEGAL, public ATS job-board APIs
 * (Greenhouse, Lever, Ashby) — the compliant alternative to scraping LinkedIn.
 *   npm run data:jobs   ->  supabase/seed/source/ats-jobs.json  (vendored snapshot)
 *
 * Boards come from the `ats` field of each company in supabase/seed/companies.json (single source
 * of truth). For each board we pull postings, keep the ones relevant to students (intern / co-op /
 * apprentice / early-career / trainee / fellow / high-school), and extract the apply URL, a
 * qualifications snippet, and any explicit age minimum (BUILD_PROMPT item 4). Failures per board
 * are non-fatal (a dead token just yields no jobs). Build-time only — no per-request cost (§0.7).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAtsBoards } from "../lib/sources/companies";
import type { AtsJob } from "../lib/sources/atsJobs";
import { extractAgeMin, extractQualifications, htmlToText, isStudentRole } from "../lib/sources/ats-parse";

const OUT = join(process.cwd(), "supabase", "seed", "source", "ats-jobs.json");
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PER_BOARD = 25; // cap so one big board can't dominate the dataset

async function getJson<T>(url: string): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "OppMatch/1.0 (student opportunity aggregator)" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type Board = ReturnType<typeof loadAtsBoards>[number];

function mk(board: Board, id: string, title: string, applyUrl: string, extra: Partial<AtsJob>): AtsJob {
  return {
    id: `${board.provider}:${board.token}:${id}`,
    company_id: board.id,
    company_name: board.name,
    company_website: board.website,
    provider: board.provider,
    title: title.trim(),
    apply_url: applyUrl,
    location_name: extra.location_name ?? null,
    is_remote: extra.is_remote ?? false,
    department: extra.department ?? null,
    qualifications: extra.qualifications ?? null,
    age_min: extra.age_min ?? null,
    posted_at: extra.posted_at ?? null,
    tags: board.tags,
  };
}

async function fetchGreenhouse(board: Board): Promise<AtsJob[]> {
  const data = await getJson<{ jobs?: Array<Record<string, unknown>> }>(
    `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`,
  );
  const jobs = data?.jobs ?? [];
  const out: AtsJob[] = [];
  for (const j of jobs) {
    const title = String(j.title ?? "");
    if (!isStudentRole(title)) continue;
    const text = htmlToText(String(j.content ?? ""));
    const loc = (j.location as { name?: string } | undefined)?.name ?? null;
    const dept = (j.departments as Array<{ name?: string }> | undefined)?.[0]?.name ?? null;
    out.push(
      mk(board, String(j.id), title, String(j.absolute_url ?? board.website ?? ""), {
        location_name: loc,
        is_remote: /remote/i.test(loc ?? ""),
        department: dept,
        qualifications: extractQualifications(text),
        age_min: extractAgeMin(text),
        posted_at: typeof j.updated_at === "string" ? j.updated_at.slice(0, 10) : null,
      }),
    );
    if (out.length >= MAX_PER_BOARD) break;
  }
  return out;
}

async function fetchLever(board: Board): Promise<AtsJob[]> {
  const data = await getJson<Array<Record<string, unknown>>>(
    `https://api.lever.co/v0/postings/${board.token}?mode=json`,
  );
  const out: AtsJob[] = [];
  for (const j of data ?? []) {
    const title = String(j.text ?? "");
    if (!isStudentRole(title)) continue;
    const cats = (j.categories as { location?: string; department?: string } | undefined) ?? {};
    const text = String(j.descriptionPlain ?? "");
    out.push(
      mk(board, String(j.id), title, String(j.applyUrl ?? j.hostedUrl ?? ""), {
        location_name: cats.location ?? null,
        is_remote: String(j.workplaceType ?? "").toLowerCase() === "remote" || /remote/i.test(cats.location ?? ""),
        department: cats.department ?? null,
        qualifications: extractQualifications(text),
        age_min: extractAgeMin(text),
        posted_at: typeof j.createdAt === "number" ? new Date(j.createdAt).toISOString().slice(0, 10) : null,
      }),
    );
    if (out.length >= MAX_PER_BOARD) break;
  }
  return out;
}

async function fetchAshby(board: Board): Promise<AtsJob[]> {
  const data = await getJson<{ jobs?: Array<Record<string, unknown>> }>(
    `https://api.ashbyhq.com/posting-api/job-board/${board.token}`,
  );
  const out: AtsJob[] = [];
  for (const j of data?.jobs ?? []) {
    const title = String(j.title ?? "");
    if (!isStudentRole(title)) continue;
    const text = String(j.descriptionPlain ?? "");
    out.push(
      mk(board, String(j.id), title, String(j.applyUrl ?? j.jobUrl ?? ""), {
        location_name: (j.location as string | undefined) ?? null,
        is_remote: Boolean(j.isRemote),
        department: (j.department as string | undefined) ?? null,
        qualifications: extractQualifications(text),
        age_min: extractAgeMin(text),
        posted_at: typeof j.publishedAt === "string" ? j.publishedAt.slice(0, 10) : null,
      }),
    );
    if (out.length >= MAX_PER_BOARD) break;
  }
  return out;
}

async function fetchBoard(board: Board): Promise<AtsJob[]> {
  try {
    if (board.provider === "greenhouse") return await fetchGreenhouse(board);
    if (board.provider === "lever") return await fetchLever(board);
    if (board.provider === "ashby") return await fetchAshby(board);
  } catch {
    /* non-fatal */
  }
  return [];
}

async function main() {
  const boards = loadAtsBoards();
  console.log(`data:jobs — fetching ${boards.length} ATS boards…`);
  const all: AtsJob[] = [];
  const seen = new Set<string>();

  // Small concurrency so we're gentle on the public APIs.
  const CONCURRENCY = 5;
  for (let i = 0; i < boards.length; i += CONCURRENCY) {
    const batch = boards.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(fetchBoard));
    results.forEach((jobs, k) => {
      const board = batch[k];
      let kept = 0;
      for (const job of jobs) {
        if (!job.apply_url || seen.has(job.id)) continue;
        seen.add(job.id);
        all.push(job);
        kept++;
      }
      console.log(`  ${board.provider}/${board.token}: ${kept} student roles`);
    });
  }

  mkdirSync(join(process.cwd(), "supabase", "seed", "source"), { recursive: true });
  writeFileSync(OUT, JSON.stringify(all, null, 0));
  const withAge = all.filter((j) => j.age_min != null).length;
  const withQual = all.filter((j) => j.qualifications).length;
  console.log(`\ndata:jobs — wrote ${all.length} postings (${withQual} with qualifications, ${withAge} with an age minimum)`);
}

main();
