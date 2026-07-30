-- 0004_reports_tags.sql
-- Report/broken-link flags (BUILD_PROMPT §7) + custom interest-tag requests (§2c/§3).
-- Both are written only through server API routes (via the pg pool, which connects as a
-- privileged role and bypasses RLS). RLS is enabled with NO policies so these tables are never
-- readable/writable by anon/authenticated through PostgREST — service-side only.

-- ---------------------------------------------------------------------------
-- reports — a student flags a listing (broken link, outdated, etc.) for admin review.
-- ---------------------------------------------------------------------------
create table if not exists reports (
  id          bigint generated always as identity primary key,
  listing_id  bigint references listings(id) on delete cascade,
  slug        text,
  reason      text not null check (reason in ('broken_link','outdated','inaccurate','inappropriate','other')),
  detail      text,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists reports_unresolved_idx on reports (resolved, created_at);

-- ---------------------------------------------------------------------------
-- custom_tag_requests — a free-text niche interest that didn't snap to an existing tag; kept so
-- it can still influence matching and later be promoted into a real tag by an admin (§3 step 4).
-- ---------------------------------------------------------------------------
create table if not exists custom_tag_requests (
  id          bigint generated always as identity primary key,
  text        text not null,
  embedding   vector(384),
  status      text not null default 'pending' check (status in ('pending','promoted','rejected')),
  created_at  timestamptz not null default now()
);

alter table reports              enable row level security;
alter table custom_tag_requests  enable row level security;
-- No policies: only the server (privileged pg role) may touch these.
