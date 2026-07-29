-- 0003_profiles.sql
-- OppMatch — user/personality foundation (BUILD_PROMPT §2b/§2c).
--
-- Adds the tables the classifier (§3) and matching (§5) write to: profiles (with the
-- SECRET personality vector), the personality-archetype taxonomy, the user's interest
-- tags, saved stars, the application tracker, orgs, and the per-listing desired
-- personalities used only for ranking.
--
-- GUARDRAIL §0.1 (personality is secret) is enforced structurally here, not by convention:
-- the personality columns are WRITABLE by their owner (the on-device classifier stores its
-- result) but carry NO select grant to anon/authenticated, so no student client can ever
-- read them back. Only service_role (server-side ranking) sees them. The personality
-- archetype LABELS/vectors on listings are likewise service-only.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type application_status as enum ('interested','applied','accepted','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type org_verification as enum ('unverified','pending','verified','rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- personality_archetypes — the fixed taxonomy (10 rows), seeded from
-- supabase/seed/personality.json. anchor_text feeds the precomputed embedding.
-- This table is reference data; its vectors are used only for ranking, never shown.
-- ---------------------------------------------------------------------------
create table if not exists personality_archetypes (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  label       text not null,
  description text not null,
  anchor_text text not null,
  embedding   vector(384),                 -- from scripts/embed-archetypes.ts
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated student. personality_vector /
-- personality_archetypes are SECRET (see column grants at the bottom of this file).
-- Location is stored at low precision (region + coarse lat/lng) per BUILD_PROMPT §2c.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  grade                  integer check (grade is null or grade between 1 and 13),
  age                    integer check (age is null or age between 5 and 100),
  region                 text,
  region_lat             double precision,          -- coarse, city-level at most
  region_lng             double precision,
  -- SECRET: used only for server-side ranking, never returned to the owning client.
  personality_vector     vector(384),
  personality_archetypes text[],
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists trg_profiles_touch on profiles;
create trigger trg_profiles_touch before update on profiles
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- user_interest_tags — the tags a student matches on. These ARE returned to the user.
-- ---------------------------------------------------------------------------
create table if not exists user_interest_tags (
  user_id  uuid   not null references profiles(id)      on delete cascade,
  tag_id   bigint not null references interest_tags(id) on delete cascade,
  primary key (user_id, tag_id)
);
create index if not exists uit_tag_idx on user_interest_tags (tag_id);

-- ---------------------------------------------------------------------------
-- orgs — registered organizations that own listings (self-registration, §4).
-- ---------------------------------------------------------------------------
create table if not exists orgs (
  id            bigint generated always as identity primary key,
  owner_user_id uuid references profiles(id) on delete set null,
  name          text not null,
  website       text,
  verification  org_verification not null default 'unverified',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_orgs_touch on orgs;
create trigger trg_orgs_touch before update on orgs
  for each row execute function touch_updated_at();

-- Link listings to an owning org (nullable: seed listings have no org).
alter table listings add column if not exists org_id bigint references orgs(id) on delete set null;

-- ---------------------------------------------------------------------------
-- listing_desired_personality — the archetypes an org wants for a listing.
-- Used ONLY for ranking (BUILD_PROMPT §2c/§5); never surfaced to students.
-- ---------------------------------------------------------------------------
create table if not exists listing_desired_personality (
  listing_id   bigint not null references listings(id)               on delete cascade,
  archetype_id bigint not null references personality_archetypes(id) on delete cascade,
  primary key (listing_id, archetype_id)
);

-- ---------------------------------------------------------------------------
-- stars — a student's saved shortlist.
-- ---------------------------------------------------------------------------
create table if not exists stars (
  user_id    uuid   not null references profiles(id) on delete cascade,
  listing_id bigint not null references listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- ---------------------------------------------------------------------------
-- applications — the Kanban tracker (BUILD_PROMPT §7 ★).
-- ---------------------------------------------------------------------------
create table if not exists applications (
  user_id    uuid   not null references profiles(id) on delete cascade,
  listing_id bigint not null references listings(id) on delete cascade,
  status     application_status not null default 'interested',
  notes      text,
  updated_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

drop trigger if exists trg_applications_touch on applications;
create trigger trg_applications_touch before update on applications
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- roles — admin flags (BUILD_PROMPT §2c).
-- ---------------------------------------------------------------------------
create table if not exists roles (
  user_id uuid primary key references profiles(id) on delete cascade,
  is_admin boolean not null default false
);

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================
alter table profiles              enable row level security;
alter table user_interest_tags    enable row level security;
alter table stars                 enable row level security;
alter table applications          enable row level security;
alter table orgs                  enable row level security;

-- A student sees and edits only their own rows.
do $$ begin
  create policy profiles_self on profiles
    for all using (auth.uid() = id) with check (auth.uid() = id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy uit_self on user_interest_tags
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy stars_self on stars
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy applications_self on applications
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Orgs: an owner manages their own org row.
do $$ begin
  create policy orgs_owner on orgs
    for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
exception when duplicate_object then null; end $$;

-- ===========================================================================
-- GUARDRAIL §0.1 — personality column privilege guard.
--
-- RLS alone would let the owning client `select personality_vector` on their own row.
-- Column privileges are checked independently of RLS, so we withhold SELECT on the
-- personality columns from every non-service role while still allowing the owner to
-- WRITE them (the on-device classifier stores its result). Result: the vector can go
-- in, but can never come back out to a student.
-- ===========================================================================
revoke all on profiles from anon, authenticated;

-- Readable, non-secret profile columns.
grant select (id, grade, age, region, region_lat, region_lng, created_at, updated_at)
  on profiles to authenticated;

-- Writable columns — note personality_* are INSERT/UPDATE-only, never SELECT.
grant insert (id, grade, age, region, region_lat, region_lng,
              personality_vector, personality_archetypes)
  on profiles to authenticated;
grant update (grade, age, region, region_lat, region_lng,
              personality_vector, personality_archetypes)
  on profiles to authenticated;

-- personality_archetypes taxonomy + desired-personality links are ranking inputs:
-- service_role only. anon/authenticated get nothing (labels would leak the scoring axis).
revoke all on personality_archetypes       from anon, authenticated;
revoke all on listing_desired_personality   from anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles_public — a convenience view that CANNOT expose personality. security_invoker
-- makes it run with the caller's privileges, so the column grants above still apply.
-- ---------------------------------------------------------------------------
create or replace view profiles_public
  with (security_invoker = true) as
  select id, grade, age, region, region_lat, region_lng, created_at, updated_at
  from profiles;

grant select on profiles_public to anon, authenticated;
