-- 0005_jobs_volunteering.sql
-- Adds the data behind BUILD_PROMPT items 2/3/4:
--   * a new `volunteer` listing kind (volunteering opportunities),
--   * new sources: curated `companies`, curated `volunteering`, and public ATS job boards (`ats`),
--   * extra listing columns carried by ATS job postings: a direct apply link + age eligibility.
--
-- Enum values are added with `if not exists` (idempotent) and are NOT used within this migration,
-- so there's no "unsafe use of new enum value in same transaction" issue (same pattern as 0002).
-- Apply with `npm run db:migrate` (or a db push) BEFORE the next `npm run db:import`, since the
-- generated dataset now contains listings whose source/kind reference these new values.

alter type listing_kind add value if not exists 'volunteer';

alter type listing_source add value if not exists 'companies';
alter type listing_source add value if not exists 'volunteering';
alter type listing_source add value if not exists 'ats';

alter table listings add column if not exists apply_url text;
alter table listings add column if not exists age_min   int;
alter table listings add column if not exists age_max   int;
