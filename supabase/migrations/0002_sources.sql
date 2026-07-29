-- 0002_sources.sql
-- Broaden the listings database beyond yc startups: large companies (S&P 500) and
-- curated research labs / HS programs. Only new enum source values are needed; the
-- listings/interest_tags shape from 0001 already supports every kind.

alter type listing_source add value if not exists 'sp500';
alter type listing_source add value if not exists 'curated';
alter type listing_source add value if not exists 'openalex';
