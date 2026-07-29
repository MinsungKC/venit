# OppMatch

A free platform matching high-school students to **companies, research labs, programs,
and opportunities** by shared interest tags. This pass ships the **listings database**:
a browsable, tag-matched set of ~4,800 entries — niche startups, large well-known
companies, university research labs, and pre-college programs. Many are **not actively
recruiting** but are still discoverable by fit (you find the best-fit place; the place
can find fitting students).

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
| **[`datasets/s-and-p-500-companies`](https://github.com/datasets/s-and-p-500-companies)** | companies | ~500 large firms; GICS sector/sub-industry become tags. Open Data Commons **PDDL** (public domain). |
| `supabase/seed/curated-listings.json` | research labs, programs, opportunities | Hand-authored (ALERTCalifornia, UCSD REHS, Salk, SIMR, RSI, NASA OSTEM, Google CSSI, BofA Student Leaders, …). Verify specifics before relying on them. |

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
| `npm run data:build` | rebuild the static dataset from the vendored snapshot |
| `npm run dev` / `build` | Next.js dev / production build |
| `npm run test` | vitest unit tests (mapping + guardrails) |
| `npm run typecheck` / `lint` | TypeScript / ESLint |
| `npm run db:start` / `db:seed` / `db:studio` | local Supabase lifecycle |
| `npm run db:import` | run the importer against `DATABASE_URL` |

## Tech

Next.js 14 (App Router, TypeScript) · Postgres + pgvector (Supabase) · node-postgres ·
vitest. Kept intentionally small.
