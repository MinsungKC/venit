# OPERATIONS.md

Runbook for OppMatch (BUILD_PROMPT §8). All data scripts read `DATABASE_URL` from a gitignored
`.env` (the hosted Supabase project). There is no local Docker/Supabase in this setup — see
`memory`/CLAUDE.md.

## Guardrails to never break
- **Personality is secret.** Never expose personality columns/vectors to a non-service client. The
  guard is structural (no SELECT grant + `profiles_public` view) and enforced by
  `__tests__/personality-guard.test.ts` + the matching leakage test. If either fails, stop.
- **≥1 interest tag** to show a listing; **age/grade** are hard filters; **research labs** need a
  location match. These live in `lib/matching.ts` — keep the tests green.

## Data pipeline (rebuild the catalog)
```
npm run data:classify           # embed taxonomy + listings -> canonical tags (build-time AI)
npm run data:build              # -> public/data/*.generated.json  (what /match + /listings read)
npm run db:import               # upsert the catalog into the hosted DB (+ prunes closed ATS jobs)
```
`data:build` is the source of truth for the read path; `db:import` mirrors it to Postgres and adds
approved org submissions. Run `data:build` after editing any `supabase/seed/*` source.

## Live job postings (Greenhouse/Lever/Ashby — the legal LinkedIn alternative)
```
npm run data:jobs               # re-pull postings -> supabase/seed/source/ats-jobs.json
npm run data:build && npm run db:import
```
Automated weekly by `.github/workflows/refresh-jobs.yml` (needs repo secret `DATABASE_URL`). Closed
roles are dropped from the snapshot on re-pull and pruned from the DB by `pruneStaleAts` on import.

## Personality ranking
```
npm run data:personality           # (re)embed the 10 archetype anchors -> archetype-vectors.json
npm run data:listing-personality   # derive REAL per-listing desired archetypes from descriptions
```
`data:listing-personality` supersedes the by-kind heuristic (`data:seed-personality`, now a
fallback). Org self-submissions keep their own chosen traits. `getDesiredVectors` caches per
process — restart the app to pick up changes locally.

## Geocoding
```
npm run data:geocode            # city coords for lab locations -> public/data/geocode.json
```
Cached; re-run only when new located listings are added. Student cities geocode via `/api/geocode`
(Nominatim, cached).

## Adding interest tags
1. Add the tag (slug = `slugify(label)`, one-sentence description) to `supabase/seed/taxonomy.json`.
2. `npm run data:classify && npm run data:build && npm run db:import` (re-embeds + re-tags).

## Promoting a niche request to a real tag
Niche free-text interests land in `custom_tag_requests` (migration 0004). To promote: add it to
`taxonomy.json` as above and re-run the pipeline; the niche slug then resolves to a canonical tag.

## Approving / rejecting org submissions
Submissions from `/register` land as `status='pending'` (source `self_registered`). Moderate at
`/admin?key=<ADMIN_KEY>` (approve/reject). Approved submissions surface on `/listings` immediately
(merged from the DB) — no rebuild needed.

## Granting admin
```
npm run admin:grant             # see scripts/grant-admin.ts for usage
```

## Rotating keys
Update the value in `.env` (and the hosting provider's env settings): `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_KEY`, `DATABASE_URL`. Never commit `.env`. After rotating
`DATABASE_URL`, update the `DATABASE_URL` GitHub Actions secret so the weekly job keeps working.

## Before committing
```
npm run test && npm run typecheck && npm run lint
```
CI (`.github/workflows/ci.yml`) runs the same on every push/PR.
