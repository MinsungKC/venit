# OppMatch

A free platform matching high-school students to **companies, research labs, programs,
and opportunities** by shared interest tags. This pass ships the **listings database**:
a browsable, tag-matched set of ~8,700 entries — niche startups, large well-known
companies, ~3,900 university research groups across 54 schools, and pre-college programs.
Many are **not actively recruiting** but are still discoverable by fit (you find the
best-fit place; the place can find fitting students).

> See `CLAUDE.md` for the non-negotiable privacy/ranking guardrails and `BUILD_PROMPT.md`
> for the full roadmap. Later phases (embeddings, hidden personality ranking, org
> self-registration, admin, matching, student UI) are not built yet.

## Data sources

All snapshots are vendored under `supabase/seed/` for reproducible builds, and normalized
by the shared, tested mapping in `lib/mapping.ts` + `lib/sources/*`. Every listed entry
shares ≥ 1 interest tag; entries with no tags (and dead companies) are excluded (§4).

| Source | Kind | Notes |
| --- | --- | --- |
| **[`yc-oss/api`](https://github.com/yc-oss/api)** | companies | ~4,300 YC startups, pre-tagged. Credit **yc-oss** + **Y Combinator**. |
| **[`datasets/s-and-p-500-companies`](https://github.com/datasets/s-and-p-500-companies)** | companies | ~500 large firms; GICS sector/sub-industry become tags. Open Data Commons **PDDL** (public domain). Website + description backfilled from **Wikidata** (`npm run data:enrich`, vendored to `sp500-enrichment.json`). |
| `supabase/seed/curated-listings.json` | research labs, programs, opportunities | ~50 hand-authored entries (ALERTCalifornia, UCSD REHS, Salk, SIMR, RSI, NYU ARISE, Fred Hutch SHIP, ASSIP, Oak Ridge, NASA OSTEM, Google CSSI, …) across many universities. Verify specifics before relying on them. |
| **[OpenAlex](https://openalex.org)** | research labs | ~3,900 university research groups across 54 schools (`npm run data:gen`, vendored to `university-labs.json`). Each is a disambiguated PI's public research area (ORCID-filtered), tagged by field/subfield, located at the university. CC0. **Not** a claim the lab accepts high schoolers — `is_recruiting=false` and no "accepting" status is shown. |

Company **logos** are shown as favicons derived from each listing's website host — no logo dataset needed.

## Quick start (no database required)

```bash
npm install
npm run data:build     # applies lib/mapping.ts to the snapshot -> public/data/*.generated.json
npm run dev            # http://localhost:3000  ->  /listings
```

The `/listings` page reads Postgres when `DATABASE_URL` is set, otherwise the generated
JSON — so you can browse the real companies immediately.

## Full setup (local Supabase)

Requires **Docker Desktop** running and the **Supabase CLI** (`scoop install supabase`,
`brew install supabase/tap/supabase`, or see the Supabase docs).

```bash
cp .env.example .env.local          # DATABASE_URL points at local Supabase by default
npm run db:start                    # boots Postgres + pgvector + Studio
npm run db:seed                     # applies migrations, then imports companies
npm run db:studio                   # -> http://127.0.0.1:54323 to browse the tables
npm run dev                         # /listings now reads the live database
```

`npm run db:seed` = `supabase db reset` (applies `supabase/migrations/`) + the importer.
The importer is idempotent; re-running upserts.

## Classification (unifying the tags)

Sources speak different tag languages — YC tags ("Hard Tech"), GICS sectors ("Industrial
Conglomerates"), OpenAlex fields ("Neuroscience"). A single embedding classifier maps every
listing into one **canonical taxonomy** (`supabase/seed/taxonomy.json`, ~109 tags across
domains, each with a description):

```
npm run data:classify   # embeds taxonomy + each listing with MiniLM (transformers.js),
                        # assigns nearest tags -> public/data/classification.json
                        #                         public/data/tag-vectors.json
```

`data:build` / `db:import` then apply that classification so `interest_tags` is the canonical
vocabulary and the "why you're seeing this" chips are consistent across every source. Runs at
build time only (no per-request AI, per guardrail §0.7). `tag-vectors.json` is the reference
space the future on-device user classifier (§3) will match against.

## Schema (this pass)

- `interest_tags` — the matchable vocabulary (seeded from yc tags, GICS sectors, and
  curated tags; embeddings added later).
- `listings` — the unified entity across `kind` = company | research_lab | program |
  opportunity | camp. `is_recruiting` is a **display badge, never a filter**.
- `listing_interest_tags` — the join. A deferred trigger enforces that an `approved`
  listing has ≥ 1 tag.

`/listings` supports a `?kind=` filter (e.g. `?kind=research_lab`). Research labs carry a
location per guardrail §5.

## Scripts

| command | what it does |
| --- | --- |
| `npm run data:build` | rebuild the static dataset (applies classification if present) |
| `npm run data:classify` | embed taxonomy + listings, assign canonical tags (needs transformers.js) |
| `npm run data:gen` | regenerate university research groups from OpenAlex |
| `npm run data:enrich` | backfill S&P 500 websites/descriptions from Wikidata |
| `npm run dev` / `build` | Next.js dev / production build |
| `npm run test` | vitest unit tests (mapping + guardrails) |
| `npm run typecheck` / `lint` | TypeScript / ESLint |
| `npm run db:start` / `db:seed` / `db:studio` | local Supabase lifecycle |
| `npm run db:import` | run the importer against `DATABASE_URL` |

## Tech

Next.js 14 (App Router, TypeScript) · Postgres + pgvector (Supabase) · node-postgres ·
vitest. Kept intentionally small.
