-- 0001_companies.sql
-- OppMatch — first schema pass: companies + interest tags.
-- See BUILD_PROMPT.md §2c and §5, and CLAUDE.md (Section 0 guardrails).
--
-- Scope of THIS migration: enough of the model to hold a browsable, tag-matched
-- database of companies (kind='company'). Personality tables, orgs, stars,
-- applications, RLS, and the personality column guard are intentionally deferred
-- to later passes; the shape here leaves room for them (nullable embedding, etc.).

create extension if not exists vector;      -- pgvector: embeddings come in a later pass

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type listing_kind as enum ('program','company','opportunity','camp','research_lab');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cost_type as enum ('free','paid','stipend','unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type listing_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type listing_source as enum ('admin','self_registered','seed','yc');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- interest_tags — the vocabulary a listing is matched on. Seeded here from the
-- yc-oss tag set; a curated/embedded taxonomy replaces/extends this later.
-- ---------------------------------------------------------------------------
create table if not exists interest_tags (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  label       text not null,
  domain      text,                                   -- coarse grouping (yc industry)
  is_niche    boolean not null default false,
  status      text not null default 'active' check (status in ('active','pending')),
  embedding   vector(384),                            -- populated in a later pass
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- listings — the unified entity for program|company|opportunity|camp|research_lab.
-- Columns not relevant to companies (grades, dates, cost_amount) are nullable.
-- ---------------------------------------------------------------------------
create table if not exists listings (
  id                    bigint generated always as identity primary key,
  external_id           text,                         -- id in the source system
  source                listing_source not null,
  kind                  listing_kind   not null,
  title                 text not null,
  slug                  text not null unique,
  url                   text,
  apply_url             text,
  linkedin_url          text,
  short_description     text check (short_description is null or char_length(short_description) <= 320),
  long_description      text,
  location_name         text,
  lat                   double precision,
  lng                   double precision,
  is_remote             boolean not null default false,
  team_size             integer,
  industry              text,
  subindustry           text,
  cost_type             cost_type not null default 'unknown',
  cost_amount           numeric,
  age_min               integer,
  age_max               integer,
  grade_min             integer,
  grade_max             integer,
  program_start         date,
  program_end           date,
  application_open      text,
  application_deadline  date,
  -- Companies that aren't currently hiring are still listed (BUILD_PROMPT §5):
  -- this is display metadata, never a filter.
  is_recruiting         boolean not null default false,
  badges                jsonb not null default '[]'::jsonb,
  status                listing_status not null default 'pending',
  embedding             vector(384),                  -- populated in a later pass
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists listings_status_kind_idx on listings (status, kind);
create index if not exists listings_industry_idx    on listings (industry);

-- ---------------------------------------------------------------------------
-- listing_interest_tags — the join that makes a listing matchable. A listing
-- with zero rows here can never be shown (guardrail below).
-- ---------------------------------------------------------------------------
create table if not exists listing_interest_tags (
  listing_id  bigint not null references listings(id)      on delete cascade,
  tag_id      bigint not null references interest_tags(id) on delete cascade,
  primary key (listing_id, tag_id)
);

create index if not exists lit_tag_idx on listing_interest_tags (tag_id);

-- ---------------------------------------------------------------------------
-- Guardrail: an `approved` listing must have >= 1 interest tag.
-- Implemented as a DEFERRABLE constraint trigger so the importer can insert the
-- listing and its tag links in the same transaction; the check runs at COMMIT.
-- ---------------------------------------------------------------------------
create or replace function enforce_listing_has_tag() returns trigger
language plpgsql as $$
begin
  if new.status = 'approved'
     and not exists (select 1 from listing_interest_tags l where l.listing_id = new.id) then
    raise exception 'listing % cannot be approved with zero interest tags', new.id
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

drop trigger if exists trg_listing_has_tag on listings;
create constraint trigger trg_listing_has_tag
  after insert or update of status on listings
  deferrable initially deferred
  for each row execute function enforce_listing_has_tag();

-- keep updated_at fresh
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_listings_touch on listings;
create trigger trg_listings_touch before update on listings
  for each row execute function touch_updated_at();
