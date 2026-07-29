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

Implemented so far: the **companies database**. Later phases (embeddings, personality,
RLS/leakage guard, org registration, admin, matching, student UI) are not built yet — the
schema is shaped to accept them.

- **Stack:** Next.js 14 (App Router, TS), Postgres + `pgvector` via Supabase (local CLI).
- **Data source:** companies seeded from **[`yc-oss/api`](https://github.com/yc-oss/api)**
  (~6k YC companies), vendored as a dated snapshot at
  `supabase/seed/source/yc-companies.json`. Attribute yc-oss + Y Combinator. Most companies
  are **not actively recruiting** but are still listed and matchable by tag (guardrail §4 /
  BUILD_PROMPT §5) — a company that yields **zero tags is dropped and never shown**.
- **Key files:**
  - `lib/mapping.ts` — pure, tested transforms yc-oss → `listings`/`interest_tags`.
    Both the DB importer and the static builder use it; keep it side-effect-free.
  - `supabase/migrations/0001_companies.sql` — enums, `interest_tags`, `listings`,
    `listing_interest_tags`, and a deferred trigger enforcing "approved ⇒ ≥1 tag".
  - `scripts/import-companies.ts` — pg importer (idempotent upsert) into local Supabase.
  - `scripts/build-listings-json.ts` — emits `public/data/*.generated.json` for the no-DB
    dev path (the `/listings` page reads the DB when `DATABASE_URL` is set, else the JSON).

## Working here

- **No personality data exists in the schema yet.** When you add it, never expose it to a
  non-service client (use a public view / column privileges), and keep the leakage test.
- Keep the dependency list small; prefer boring, free-tier tech.
- Run `npm run test && npm run typecheck && npm run lint` before committing. Local DB work
  needs Docker Desktop + Supabase CLI; without them, `npm run data:build` + `npm run dev`
  exercises the full mapping against the static dataset.
- If you regenerate the vendored snapshot, note the date and keep the field mapping in sync
  with `lib/mapping.ts`.
