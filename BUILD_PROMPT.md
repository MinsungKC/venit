# Claude Code Build Prompt — "OppMatch" (rename freely)

> A free, minimal-cost web platform that matches high‑school students to **programs, companies, opportunities, camps, and research labs** using a small, privacy‑preserving AI classifier. Students see *why* they matched (interest tags) but never see the hidden "personality" scoring that ranks results.

You are building this in phases. **Do not skip ahead.** Finish, self‑test, and commit each phase before starting the next. Prefer boring, cheap, well‑understood tech over clever infra. Every design decision should be justified against two hard constraints: **(1) it must be free / near‑zero marginal cost to run, and (2) a stressed 16‑year‑old must be able to go from login to a saved shortlist in under 3 minutes.**

---

## 0. Non‑negotiable guardrails (read first, enforce everywhere)

1. **Personality is secret.** The user's "personality" archetype/vector is used only for *ranking*. It must **never** appear in any API response sent to a student client, in the DOM, in logs, or in the UI. Only interest tags are ever shown to users. Add a test that fails if a personality field leaks into a student‑facing endpoint.
2. **Resumes are never persisted.** Resume parsing happens **client‑side in the browser** (see Phase 3). The raw resume text/file must never be uploaded, stored, or logged. Only derived tag IDs leave the device. If a server‑side fallback is ever added, it must hold the text in memory only, with a hard TTL (≤ 10 min) and immediate deletion after tag extraction — and this must be off by default.
3. **PII protection.** Before processing a resume, run a client‑side scrub that detects and warns about emails, phone numbers, full addresses, and government IDs, and strips them before embedding. Show the user what was removed.
4. **Every listing shown to a user must match ≥ 1 of the user's *interest* tags.** Personality is *never* a gating requirement — it only affects sort order.
5. **Research labs additionally require a location match** against the student's general location (region/radius), because most require in‑person presence.
6. **Age/grade eligibility is a hard filter**, not a ranking factor.
7. **Cost discipline:** no per‑request LLM calls in the hot path. Matching is vector math + a filtered SQL query. AI embedding of the *user* runs on the user's own device. Budget target: $0 at low traffic, scaling only with hosting/DB free‑tier limits.

---

## 1. Stack & project setup

Use this stack unless you hit a concrete blocker (if so, stop and explain before switching):

- **Framework:** Next.js 14 (App Router, TypeScript, React Server Components where sensible).
- **Styling/UI:** Tailwind CSS + shadcn/ui + lucide-react. Mobile‑first, WCAG AA.
- **DB / Auth:** Supabase (Postgres + `pgvector` extension + Supabase Auth + Row Level Security). Free tier.
- **Client‑side AI:** `@xenova/transformers` (transformers.js) running `Xenova/all-MiniLM-L6-v2` (384‑dim sentence embeddings) via ONNX in the browser. Model is ~25–90 MB; lazy‑load it, cache it, and show a one‑time download indicator.
- **Validation:** Zod on every input boundary.
- **Email (optional, later phases):** Resend or Supabase's built‑in — free tier, batched digests only.
- **Hosting:** Vercel or Cloudflare Pages free tier.
- **Calendar export:** generate `.ics` client‑side; also a "Add to Google Calendar" link.

Deliverables for this phase:
- Repo scaffold, `README.md`, `.env.example`, Tailwind + shadcn configured, Supabase client wired, ESLint/Prettier, a working `/` page, and CI that runs typecheck + lint + tests.
- A `CLAUDE.md` at repo root restating the Section 0 guardrails so future edits respect them.

---

## 2. Data model & tag taxonomy

### 2a. Design the taxonomies (do this before the schema)

**Interest tags** — hierarchical: top‑level *domains*, each with *sub‑tags/niches*. Seed with a broad set (aim for ~250–400 tags) covering at least:
- STEM & CS: AI/ML, software, cybersecurity, robotics, data science, math, physics, chemistry, biology, neuroscience, aerospace, environmental/earth science, astronomy.
- Engineering: mechanical, electrical, civil, biomedical, materials.
- Health & Medicine: pre‑med, nursing, public health, bioinformatics.
- Business & Finance: entrepreneurship, finance, marketing, economics, consulting.
- Arts & Design: visual art, music, film/video, theater, graphic/UX design, creative writing, fashion, architecture.
- Humanities & Social: history, philosophy, languages, journalism, law, politics, psychology, debate/Model UN.
- Environment & Sustainability, Agriculture, Community/Service, Trades/Vocational, Sports/Athletics, Education, Media/Communications.

Store each tag with: `id`, `slug`, `label`, `domain`, `description` (one sentence — this feeds the embedding), `is_niche` (bool), `status` (`active` | `pending`).

**Personality archetypes** — a small **fixed** set (~10). Each maps from user adjectives. Proposed set (adjust as you like), each with a short definition + example adjective synonyms used for matching:
- **Builder/Maker** — hands‑on, practical, tinkerer, resourceful.
- **Analyst** — analytical, logical, detail‑oriented, precise, curious.
- **Creator** — creative, artistic, imaginative, expressive.
- **Explorer** — adventurous, independent, open‑minded, curious.
- **Leader** — ambitious, driven, confident, organized.
- **Collaborator** — friendly, empathetic, team‑oriented, supportive.
- **Competitor** — competitive, determined, disciplined.
- **Helper** — compassionate, altruistic, patient, caring.
- **Communicator** — outgoing, persuasive, articulate.
- **Innovator/Visionary** — entrepreneurial, bold, inventive.

Each archetype stores an `anchor_text` (its definition + synonym list) used to precompute its embedding once.

### 2b. Precompute tag & archetype embeddings

Write a one‑time seed script that embeds every interest tag's `description` and every archetype's `anchor_text` with the **same** MiniLM model, storing 384‑dim vectors in `pgvector` columns. This is the reference space everything matches against.

### 2c. Schema (Postgres + pgvector, with RLS)

Core tables (fill in sensible columns):
- `profiles` — user id, grade, age, general_location (region + lat/lng at low precision), created_at. **`personality_vector vector(384)` and `personality_archetypes text[]` — RLS‑protected, never selectable by the owning client.** Do the personality read only in server code for ranking.
- `user_interest_tags` — (user_id, tag_id). These *are* returned to the user.
- `interest_tags`, `personality_archetypes` — the taxonomies from 2a/2b, with embeddings.
- `listings` — the unified entity for **program | company | opportunity | camp | research_lab** (a `kind` enum). Columns: title, kind, org_id, short_description (≤ 300 chars), url (primary), apply_url, linkedin_url, location (name + lat/lng), is_remote, cost_type (`free`|`paid`|`stipend`|`unknown`), cost_amount (nullable), age_min, age_max, grade_min, grade_max, program_start, program_end, application_open, application_deadline (nullable — often unknown, that's fine), status (`pending`|`approved`|`rejected`), source (`admin`|`self_registered`|`seed`), embedding `vector(384)`, created_at, updated_at.
- `listing_interest_tags` — (listing_id, tag_id). **A listing with zero interest tags can never be shown.**
- `listing_desired_personality` — (listing_id, archetype) the personalities the org wants. Used only for ranking.
- `orgs` — registered organizations, owner user_id, verification status/badge.
- `stars` — (user_id, listing_id) saved/favorited.
- `applications` — (user_id, listing_id, status enum `interested`|`applied`|`accepted`|`rejected`, notes, updated_at) for the tracker.
- `custom_tag_requests` — user‑added niche interests pending admin promotion.
- `roles` — admin flags.

Write RLS policies so students can read approved listings and their own rows, orgs can manage their own listings, and admins can do everything. **Add an explicit column‑level guard (or a dedicated view) so personality columns are never exposed through PostgREST/Supabase to non‑service clients.**

---

## 3. The classifier (the hard part) — client‑side, zero server cost

Everything here runs in the browser via transformers.js. The server only receives resulting tag IDs + the personality vector (which it stores but never echoes back).

**Interest classification:**
1. Concatenate the user's selected interest labels + any free‑text niche interests + scrubbed resume text into one document.
2. Embed it with MiniLM (client‑side).
3. Cosine‑similarity against all interest‑tag embeddings (ship the tag vectors to the client as a static, cached JSON/quantized file). Assign tags by threshold + top‑k, and *merge* with the tags the user explicitly picked (explicit picks always win).
4. Free‑text niche interests: embed each; if nearest existing tag ≥ threshold, snap to it; otherwise create a `custom_tag_request` (embedded) so it still influences matching immediately and can be promoted later by an admin.

**Personality classification:**
1. Embed the user's adjectives (client‑side).
2. Compare to the 10 archetype anchor embeddings; produce a soft weighted vector over archetypes (e.g. softmax of similarities) + top‑N archetype labels.
3. Send `personality_vector` + `personality_archetypes` to the server for storage. **Never render them.**

**Resume handling (privacy):** parse PDF/DOCX text in‑browser (e.g. pdf.js / a lightweight docx text extractor). Run the PII scrub (Section 0.3), show the user what was stripped, embed the cleaned text, then **discard it entirely** — no upload, no persistence. Resume upload must be clearly optional and skippable.

Write unit tests for: threshold/top‑k assignment, snap‑vs‑create for niche tags, and a leakage test proving personality never appears in a student response.

---

## 4. Listings database, org self‑registration & admin

**Seeding:** build an importer that ingests a CSV/JSON of real programs, companies, camps, opportunities, and research labs. For each: normalize fields, geocode the location once (cache it), embed `title + short_description`, auto‑suggest interest tags via similarity, and require at least one tag before the row can be `approved`. Include a de‑duplication check (embedding neighbor + fuzzy title/URL match). Ship a starter seed of a few dozen well‑known examples so the app isn't empty.

**Org self‑registration:** a public form where a program/company/opportunity can register, describe itself, add links (site / LinkedIn / apply URL), set location + remote flag, cost, dates, eligibility, and **must select ≥ 1 interest tag and the personalities they're seeking.** New submissions land in a **moderation queue** (`status = pending`) — never live until approved. Rate‑limit and add basic anti‑spam.

**Admin panel:** authenticated admins can add / edit / remove / approve / reject any org or listing, promote `custom_tag_requests` into real tags (re‑embedding as needed), manage verification badges, and see lightweight analytics (which interest tags have too few listings — i.e. supply gaps).

---

## 5. Matching & ranking

Given a student profile, produce the result set with this pipeline (a single filtered SQL query + in‑memory scoring is fine and cheap):

**Hard filters (must all pass):**
- Listing shares **≥ 1 interest tag** with the user.
- Age within `[age_min, age_max]` and grade within `[grade_min, grade_max]` (when specified).
- `status = approved`.
- If `kind = research_lab`: student's location must be within the lab's region/radius (or lab is explicitly remote).

**Ranking score (all three independently sortable by the user):**
- **Personality fit** — cosine between the user's hidden `personality_vector` and the listing's desired‑personality vector (built from its archetypes). Surface this only as a coarse label like "Great fit / Good fit" — **never** the archetype names or scores.
- **Location** — distance from student to listing (remote listings rank as distance 0 / "Remote"). Provide a max‑radius filter.
- **Cost** — free < stipend < paid, then by amount; expose a "free only" toggle.

Default sort = a sensible blend (fit, then distance, then cost). Let the user re‑sort by any single axis. Companies not currently hiring interns are still eligible as long as they match ≥ 1 interest tag — mark them "Not actively recruiting" but still list them.

Write tests for the hard filters and each sort axis, plus a golden test: a sample student produces an expected ordered list.

---

## 6. Student‑facing UX (make it fast)

- **Onboarding wizard** (≤ 4 short steps, progress bar, everything editable later): pick interests (chips grouped by domain + search + "add your own niche"), enter adjectives, enter grade + age, optional resume drop (with the privacy notice front‑and‑center). Compute tags on device, then land straight on results.
- **Results page:** clean cards showing title, kind badge, one‑line description, coarse fit label, distance/Remote, cost, matched **interest tags** (the "why"), primary link + apply link/LinkedIn. Filters rail: kind, cost, remote, radius, deadline‑soon. Sort dropdown.
- **Star** any listing → saved to a shortlist. Shortlist view + export.
- **Add deadline to calendar:** per listing, generate an `.ics` and a Google Calendar link when a deadline exists.
- **Edit profile** anytime; recompute matches on save.
- Empty/loading/error states; skeletons while the model warms up.

---

## 7. Recommended additional features (I'm adding these — build the ones marked ★ now, stub the rest)

★ **Application tracker** — a simple Kanban (`Interested → Applied → Accepted/Rejected`) with notes and deadline chips, so a student manages their whole search in one place.
★ **"Deadline soon" digest & reminders** — optional weekly email of new matching listings + upcoming deadlines from their starred list (batched, free‑tier friendly). Also in‑app reminders.
★ **Match explanation** — a small "Why you're seeing this" popover listing the shared interest tags (never personality).
★ **Similar opportunities** — "More like this" via embedding nearest‑neighbors on the listing.
★ **Report / broken‑link flag** + a scheduled dead‑link checker (cron) that auto‑flags stale listings for admin review.
- **Shareable shortlists** — a read‑only link a student can send to a parent, teacher, or counselor.
- **Counselor/teacher mode** — an educator can create a class and push curated opportunities to students (later).
- **Eligibility flags** — residency/citizenship, prerequisites, financial‑aid/scholarship‑available badge, so students don't waste time on things they can't do.
- **Supply‑gap analytics for admins** — which interest tags have too few approved listings, to guide outreach.
- **Map view** toggle for local/in‑person opportunities.
- **Accessibility & i18n scaffolding** — WCAG AA now, translation‑ready strings for later.
- **Save without account** (local‑first) then optional sign‑up to sync — lowers friction for a free tool.

---

## 8. Cost, privacy & deployment hardening (final phase)

- Confirm the hot path makes **zero** paid AI calls; all user embedding is client‑side; matching is SQL + vector math.
- Audit for personality leakage (endpoints, logs, error payloads, client bundles). Add the leakage test to CI.
- Confirm resumes are never transmitted or stored; verify via network inspection notes in the README.
- Add caching for the model file, tag‑vector file, and geocoding.
- Rate‑limit registration & report endpoints; add moderation queue safeguards.
- Set up free‑tier deploy (Vercel/Cloudflare + Supabase), document env vars, seed steps, and how to run the embedding seed script.
- Write a short `OPERATIONS.md`: how to add tags, promote niche requests, approve orgs, and rotate keys.

---

## How to work

Go phase by phase. At the end of each phase: run typecheck + lint + tests, write a one‑paragraph summary of what changed and why, and commit. If any instruction here conflicts with the Section 0 guardrails, the guardrails win. If you believe a cheaper or simpler approach beats what's specified, pause and propose it with the cost/complexity tradeoff before implementing. Keep the code readable and the dependency list small.
