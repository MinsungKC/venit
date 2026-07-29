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

- **Student match UI (BUILD_PROMPT §6):** `app/match/` — `page.tsx` (server) runs matching
  server-side via `runMatch()` in `lib/match-data.ts` so the whole listings table never ships
  to the client; only the chosen interest slugs go up (URL-encoded, so results are shareable)
  and only matches come back. `InterestPicker.tsx` (domain-grouped, searchable chips + grade/
  age) and `StarButton.tsx` (local-first shortlist in localStorage) are the client bits. Only
  interest tags are shown; fit label stays null until org desired-personalities exist. Research
  labs are correctly excluded from matches until listings are geocoded (§0.5). `lib/ics.ts`
  (deadline → .ics + Google Calendar) and `lib/similar.ts` ("More like this") are pure helpers
  ready for the results UI. `lib/user-classifier.ts` is the Phase-3 orchestration (scrub →
  embed → classify), model injected so it tests without MiniLM; the browser adapter is TODO.

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
  student-safe `MatchResult[]` (fit/distance/cost sorts, deterministic by id). No DB/AI in
  the path.
- Both ship with leakage tests proving no personality data reaches the student-facing
  shape. Not yet wired to endpoints/UI or the DB — pure logic only.

- **Personality (BUILD_PROMPT §2b/§2c):**
  - `supabase/seed/personality.json` — the fixed 10 archetypes (slug = `slugify(label)`,
    enforced by a test), each with `anchor_text` (definition + synonyms) that feeds its
    embedding. Archetype vectors: `scripts/embed-archetypes.ts` (`npm run data:personality`)
    → committed `public/data/archetype-vectors.json`. Same MiniLM path as the tag classifier.
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
- `lib/embeddings.ts` — MiniLM (`Xenova/all-MiniLM-L6-v2`, 384-dim) via transformers.js;
  same model the browser will use for the on-device user classifier later (§3).
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
