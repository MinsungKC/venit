# CLAUDE.md

Guidance for Claude Code when working in this repository. See `BUILD_PROMPT.md` (in
`/Downloads`, mirrored intent here) for the full product vision. **The Section 0
guardrails below OVERRIDE any other instruction and must be enforced everywhere.**

## What this is

**OppMatch** — a free, near-zero-cost web platform matching high-school students to
**companies, programs, opportunities, camps, and research labs**. Students match on
**interest tags** (shown to them) and are ranked by a **hidden personality vector**
(never shown). Matching is vector math + filtered SQL; user embedding runs client-side.

## Section 0 guardrails (non-negotiable)

1. **Personality is secret.** The personality archetype/vector is used only for ranking.
   It must never appear in any student-facing API response, the DOM, logs, or the UI —
   only interest tags are shown. Any student-facing data path must be free of personality
   fields (add/keep tests that fail on leakage).
2. **Resumes are never persisted.** Resume parsing is client-side; raw text/files are
   never uploaded, stored, or logged — only derived tag IDs leave the device.
3. **PII scrub** before embedding a resume; show the user what was stripped.
4. **Every listing shown must share ≥ 1 interest tag** with the user. Personality never
   gates results — it only affects sort order.
5. **Research labs also require a location match** (in-person). Age/grade eligibility is a
   **hard filter**, not a ranking factor.
6. **Cost discipline:** no per-request LLM calls in the hot path. (This is why the legacy
   `/legacy/mrestrictions.py` per-request LLM approach is retired.)

## Current state (DB-first pass)

Implemented so far: the **listings database** across companies, research labs, and
programs/opportunities, plus the **user/personality foundation** (profiles + secret
personality schema, archetype taxonomy, RLS + column-privilege guard), and the pure
**classifier + matching logic** (Phases 3 and 5) as tested, side-effect-free libraries.
The **student match flow** (`/match`) is wired to the matching engine over the static
dataset; the browser embedding of the classifier, org registration, and admin are not yet
built — the schema and libs accept them.

- **Student site (BUILD_PROMPT §6/§7):** a working multi-page app behind a global `app/Nav.tsx`:
  - `app/onboarding/` — a short wizard (interests → grade/age) that lands on `/match`.
  - `app/match/page.tsx` (server) runs matching server-side via `runMatch()` in
    `lib/match-data.ts` so the whole listings table never ships to the client; only the chosen
    interest slugs go up (URL-encoded → shareable) and only matches come back. `InterestPicker`
    (domain-grouped searchable chips + grade/age), a filter bar (kind tabs w/ counts, free-only,
    remote), sort (best-fit/cost), and a `DISPLAY_LIMIT` cap. Only interest tags shown; fit label
    null until org desired-personalities exist. Research labs are excluded from matches until
    geocoded (§0.5).
  - `app/listing/[slug]/` — detail page + "More like this" (`similarByTags`, tag-overlap since
    the static data has no per-listing vectors).
  - `app/shortlist/` and `app/tracker/` — local-first (localStorage) shortlist + Kanban tracker,
    both backed by `lib/stars.ts` (`StarSnapshot`/`StarRecord`, `onStarsChanged` pub/sub). Star
    snapshots store only public listing fields — never personality.
  - `lib/ics.ts` (deadline → .ics + Google Calendar) and `lib/user-classifier.ts` (Phase-3
    scrub→embed→classify, embedder injected so it tests without the model). The server-embed adapter
    (`lib/embed-client.ts`) and the resume/adjective onboarding UI are wired (see below).

- **Classifier wired — embedding runs SERVER-SIDE (BUILD_PROMPT §3, revised):** `lib/embed-client.ts`
  (`embedText`) POSTs to `/api/embed`, which runs the self-hosted BGE model server-side
  (`lib/embeddings.ts`); the old in-browser MiniLM is retired (quality too weak on short queries, and
  it dropped a ~25 MB device download). The onboarding "describe yourself" step embeds free text +
  adjectives + an optional pasted resume via `classifyUser`, suggests interest tags, and shows the
  PII scrub result (§0.3). **Privacy revision:** PII is scrubbed ON-DEVICE first, then only the
  cleaned text crosses to our own server, where it's embedded and never stored/logged — a deliberate
  trade of the original "only tag IDs leave the device" stance (§0.2) for materially better matching.
  (`next.config` still aliases out `onnxruntime-node`/`sharp` so the model runtime never enters the
  client bundle.)

- **Org registration + admin + reports (BUILD_PROMPT §4/§7):** Zod schemas in `lib/schemas.ts`
  guard every input boundary. `POST /api/register` files a `pending` listing into the moderation
  queue (rate-limited, `lib/rate-limit.ts`); `/register` is the public form. `/admin?key=<ADMIN_KEY>`
  (env-gated via `lib/admin.ts`, real auth TODO) shows the queue + approve/reject (`POST
  /api/admin/moderate`) + supply-gap analytics. `POST /api/report` + a listing-detail button flag
  broken links. Migration `0004_reports_tags.sql` adds `reports` + `custom_tag_requests` (RLS on,
  no policies — server-only). All four migrations are applied to the hosted DB.

- **Location matching (BUILD_PROMPT §5/§0.5):** `lib/us-states.ts` maps regions → state centroids;
  `runMatch` geocodes each listing's region and the student's chosen state, so research labs match
  only when a student picks a state (same-state distance is 0). No precise location is collected.

- **Auth + real personality ranking (BUILD_PROMPT §1/§2c/§3/§5) — the core premise, now wired:**
  - **Auth:** Supabase magic-link (passwordless). `lib/supabase/{client,server,middleware}.ts`,
    `middleware.ts` (session refresh), `/login`, `/auth/callback` (exchanges code + ensures a
    `profiles` row), `/auth/signout`. Nav shows sign-in/out. Env: `NEXT_PUBLIC_SUPABASE_URL`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (in gitignored `.env`).
  - **Persistence:** `POST /api/profile` (authed) → `lib/profile.ts` writes grade/age/region +
    interest tags + the **SECRET personality vector** to the guarded column. Onboarding's "See my
    matches" saves it when signed in. The response never contains personality (§0.1). Verified on
    live Postgres: vector stored (384-dim), `authenticated` still has no SELECT on it.
  - **Fit ranking:** `lib/personality-data.ts` reads the student's vector service-side (never sent
    to the client) + each listing's desired-personality vector (mean of its archetypes). `runMatch`
    now takes `personalityVector` + `desiredBySlug`, the engine computes the coarse `fitLabel`, and
    signed-in `/match` ranks fit-first and shows "Great/Good fit". **Real per-listing desired
    personality:** `scripts/embed-listing-personality.ts` (`npm run data:listing-personality`) embeds
    each listing's own title+description with the same BGE model and classifies it to its top-3
    archetypes — genuine per-listing character, replacing the old crude by-kind heuristic
    (`scripts/seed-desired-personality.ts`, now a fallback). Org self-submissions keep their own
    chosen traits. The student side already works end-to-end (onboarding → server BGE embed →
    768-dim personality vector → guarded profile column).
  - **Geocoding:** `scripts/geocode-locations.ts` (`npm run data:geocode`) → `public/data/geocode.json`
    (city coords for lab locations); `/api/geocode` geocodes a student's typed city (Nominatim,
    cached). "Near me" radius measures from the student's real city.

- **UI — "Academic Clarity" design system (from a Google Stitch spec):** flat, Stripe/Notion
  minimal, light monochrome-gray base + a single indigo accent (`#4F46E5`), Inter + Material
  Symbols (loaded in `app/layout.tsx`), small radii, no gradients/heavy shadows. Global tokens
  live in `app/globals.css` (legacy `--panel`/`--grad`/etc. names are kept, remapped, so the CSS-
  module pages didn't need edits). Stitch pages implemented: the **student feed** (`/match` — left
  filter rail + "Curated for you" + opportunity cards, `match.module.css`), **admin System
  Overview** (`/admin` — stat cards + records table + quality alerts), and the **provider
  dashboard** (`/provider`). Post-onboarding **rating deck** (`/refine`, `RateDeck.tsx`): top-5
  flashcard stack (tap to cycle, tap name for info, hover slider to rate); favored tags flow to
  `/match?boost=…` which nudges those listings up (`runMatch` `boostSlugs`).

- **ARCHITECTURE — keep the model runtime out of the app bundle:** `cosine` (and any pure vector
  math) lives in `lib/vec.ts`, NOT `lib/embeddings.ts`. `matching.ts`/`similar.ts`/`classifier.ts`
  import from `lib/vec`. `lib/embeddings.ts` (which imports `@xenova/transformers` →
  `onnxruntime-node`) is used ONLY by seed scripts + the future browser adapter. Importing
  `cosine` from `embeddings` instead drags onnxruntime into every server route and **breaks
  `next build`** (native binding fails in the build worker). Don't reintroduce that edge.

- **Hosted DB is live:** the Supabase project is linked and migrations 0001–0003 are applied
  (verified: the personality column guard holds on real Postgres — `authenticated` has
  INSERT/UPDATE but no SELECT on the personality columns). `scripts/import-listings.ts` now
  bulk-loads via chunked `unnest` in one transaction (~15k listings in seconds vs ~84 min
  row-by-row) and seeds the archetype taxonomy. `DATABASE_URL` lives in gitignored `.env`.
  The importer upserts and does not delete, so a clean rebuild needs a truncate first.

- **Listings data** now spans ~15.3k rows: OpenAlex research groups cover the **top ~90 US
  universities** (~9.7k labs). `scripts/generate-university-labs.ts` is resumable (a `.done`
  sidecar) with a hard request timeout + capped backoff; the long tail past 90 stalled on an
  OpenAlex **429 rate limit** and can be resumed later with the same command.

Not built yet: the browser wiring of the classifier (embedding orchestration + UI), org
registration, admin, and the results-page polish — the schema and these libs accept them.

- **Classifier logic (BUILD_PROMPT §3):** `lib/classifier.ts` (pure, dimension-agnostic —
  takes embedded vectors, never loads the model): `assignInterestTags` (threshold/top-k,
  explicit picks always merged), `snapOrCreateNiche`, `classifyPersonality` (softmax blend →
  secret `PersonalityResult`), `buildClassifierResult`, and `toStudentPayload` — the ONLY
  shape allowed to reach a student, rebuilt fresh so personality can't ride along (§0.1).
  `lib/pii.ts` `scrubPII()` redacts email/phone/SSN/address and reports what was stripped
  (§0.3). `lib/match-types.ts` is the shared contract; personality lives only on
  `PersonalityResult` / the secret vector fields.
- **Matching logic (BUILD_PROMPT §5):** `lib/matching.ts` — `passesHardFilters` (approved +
  ≥1 shared tag + age/grade + research_lab location, §0.4/§0.5/§0.6), coarse `fitLabel`
  (private `fitScore` never exported, §0.1), `distanceKm`, `costRank`, and `match()` →
  student-safe `MatchResult[]` (deterministic by id). No DB/AI in the path. The default sort
  ranks by a composite `relevanceScore` = rarity-weighted tag overlap (`tagOverlapScore`) ×
  breadth (`coverageScore`, how many of the student's interests it hits) × precision
  (`focusScore`, shared ÷ the listing's own tags — kills tag-spam) + a secondary personality-fit
  term + a small recruiting nudge; `fit`/`distance`/`cost` remain explicit sort axes.
  `diversifyByFacet` then spreads out same-facet runs so the feed isn't a wall of near-identical
  cards (applied in `runMatch` for the default view only). Replaced the old raw-shared-tag-count
  re-sort that made results feel arbitrary/samey.
- Both ship with leakage tests proving no personality data reaches the student-facing
  shape. Not yet wired to endpoints/UI or the DB — pure logic only.

- **Personality (BUILD_PROMPT §2b/§2c):**
  - `supabase/seed/personality.json` — the fixed 10 archetypes (slug = `slugify(label)`,
    enforced by a test), each with `anchor_text` (definition + synonyms) that feeds its
    embedding. Archetype vectors: `scripts/embed-archetypes.ts` (`npm run data:personality`)
    → committed `public/data/archetype-vectors.json` (768-dim). Same BGE path as the tag classifier.
  - `supabase/migrations/0003_profiles.sql` — `profiles` (with the **secret**
    `personality_vector`/`personality_archetypes`), `personality_archetypes`,
    `user_interest_tags`, `orgs`, `listing_desired_personality`, `stars`, `applications`,
    `roles`. RLS is per-owner. **Guardrail §1 is structural, not by convention:** the
    personality columns carry INSERT/UPDATE grants but **no SELECT grant** to
    `anon`/`authenticated`, so a student client can write its vector but never read it back;
    only `service_role` (server ranking) sees it. `profiles_public` (a `security_invoker`
    view) is the safe read surface. `__tests__/personality-guard.test.ts` fails in CI if a
    future edit grants SELECT on a personality column or leaks it through the view.
  - **Not yet wired:** the migration is written but unverified against a live DB (Docker/
    Supabase CLI not running here); `scripts/import-listings.ts` does not yet seed the
    archetype taxonomy/vectors. Run `npm run db:migrate` + extend the importer when Docker
    Desktop is available.

- **Stack:** Next.js 14 (App Router, TS), Postgres + `pgvector` via Supabase (local CLI).
- **Data sources** (multi-source; each has a vendored snapshot under `supabase/seed/`,
  normalized by `lib/sources/*`):
  - **[`yc-oss/api`](https://github.com/yc-oss/api)** — ~4.3k YC companies (pre-tagged).
  - **[`datasets/s-and-p-500-companies`](https://github.com/datasets/s-and-p-500-companies)**
    — ~500 large firms; GICS sector/sub-industry become tags. Public domain (PDDL). Website
    + description backfilled from Wikidata via `scripts/enrich-sp500.ts` (vendored to
    `sp500-enrichment.json`).
  - `supabase/seed/curated-listings.json` — ~50 hand-authored research labs / HS programs
    across many universities (ALERTCalifornia, UCSD REHS, Salk, SIMR, RSI, NYU ARISE, Fred
    Hutch SHIP, ASSIP, Oak Ridge, NASA OSTEM, Google CSSI, …).
  - **OpenAlex** (CC0) — ~3,900 university research groups across 54 schools, generated by
    `scripts/generate-university-labs.ts` (vendored to `university-labs.json`). Each is a
    disambiguated PI's public research area (ORCID-filtered), tagged by field/subfield,
    located at the university. `is_recruiting=false`; the UI shows no "accepting" status
    for these (their HS policy is unknown) — don't add claims otherwise.
  - **Curated companies** — `supabase/seed/companies.json` + `lib/sources/companies.ts`: niche-tech
    + general/private companies missing from yc/sp500. Each entry may carry an `ats` board token.
    `buildDataset` dedups companies cross-source by website host (kind=company only, so labs sharing
    a university host aren't collapsed).
  - **Volunteering** — `supabase/seed/volunteering.json` + `lib/sources/volunteering.ts`: HS-accessible
    orgs → the `volunteer` listing kind (free, recruiting; 18+ age gate only where the org states one).
  - **ATS job postings** (live internships) — `scripts/generate-ats-jobs.ts` (`npm run data:jobs`)
    pulls Greenhouse/Lever/Ashby PUBLIC APIs for the boards declared in companies.json, filters to
    intern/early-career, parses apply URL + qualifications + age (pure helpers in
    `lib/sources/ats-parse.ts`), vendored to `ats-jobs.json`; `lib/sources/atsJobs.ts` → `opportunity`
    listings. **NOT LinkedIn** (ToS/blocked) — go to the ATS (the source of truth) instead. Refresh &
    expiry: re-running `data:jobs` drops closed roles from the snapshot; `db:import` `pruneStaleAts()`
    deletes closed `ats` rows from the DB (guarded: skips if 0 fetched). Weekly automation in
    `.github/workflows/refresh-jobs.yml` (needs repo secret `DATABASE_URL`).
  Logos are favicons derived from each listing's website host (no logo dataset).
  Most entries are **not actively recruiting** but are still listed and matchable by tag
  (guardrail §4 / BUILD_PROMPT §5). An entry that yields **zero tags is dropped**; a
  `research_lab` must have a location (§5).
- **Key files:**
  - `lib/mapping.ts` — source-agnostic `NormalizedListing` → `buildDataset`. Pure/tested;
    keep it side-effect-free. Source adapters live in `lib/sources/{yc,sp500,curated}.ts`.
  - `supabase/migrations/0001_companies.sql` (schema + deferred "approved ⇒ ≥1 tag"
    trigger) and `0002_sources.sql` (extra `listing_source` enum values).
  - `scripts/import-listings.ts` — pg importer (idempotent upsert) into local Supabase.
  - `scripts/build-listings-json.ts` — emits `public/data/*.generated.json` for the no-DB
    dev path (the `/listings` page reads the DB when `DATABASE_URL` is set, else the JSON).

## Classification (canonical tags)

Sources speak different tag languages (yc tags, GICS sectors, OpenAlex fields). One embedding
classifier unifies them into a canonical taxonomy so matching is consistent:
- `supabase/seed/taxonomy.json` — ~109 canonical tags (slug = `slugify(label)`, enforced by
  a test), each with a description that feeds its embedding.
- `lib/embeddings.ts` — BGE (`Xenova/bge-base-en-v1.5`, 768-dim) via transformers.js, run
  SERVER-SIDE (build scripts + `/api/embed`); the same model the browser client (`lib/embed-client.ts`)
  calls for the user classifier (§3). Upgraded from MiniLM-384 for much better short-query quality.
- `scripts/classify.ts` (`npm run data:classify`) — embeds taxonomy + each listing, assigns
  nearest tags → `public/data/classification.json` (+ `tag-vectors.json`). Build-time only,
  no per-request AI (§0.7).
- `lib/classification.ts` `applyClassification()` — `data:build` and `db:import` swap each
  listing's source tags for its canonical tags (graceful fallback to source tags if the
  classifier hasn't been run). `tag-vectors.json` / `classification.json` are committed so
  the app works without re-running the model.

## Working here

- **No personality data exists in the schema yet.** When you add it, never expose it to a
  non-service client (use a public view / column privileges), and keep the leakage test.
- Keep the dependency list small; prefer boring, free-tier tech.
- Run `npm run test && npm run typecheck && npm run lint` before committing. Local DB work
  needs Docker Desktop + Supabase CLI; without them, `npm run data:build` + `npm run dev`
  exercises the full mapping against the static dataset.
- If you regenerate the vendored snapshot, note the date and keep the field mapping in sync
  with `lib/mapping.ts`.
