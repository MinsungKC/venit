# venit

A free platform matching high-school students to **companies, research labs, programs,
and opportunities** by shared interest tags. This pass ships the **listings database**:
a browsable, tag-matched set of ~8,700 entries: niche startups, large well-known
companies, ~3,900 university research groups across 54 schools, and pre-college programs.
Many are **not actively recruiting** but are still discoverable by fit (you find the
best fit place; the place can find fitting students).

## Data sources

All snapshots are vendored under `supabase/seed/` for reproducible builds, and normalized
by the shared, tested mapping in `lib/mapping.ts` + `lib/sources/*`. Every listed entry
shares ≥ 1 interest tag; entries with no tags (and dead companies) are excluded (§4).

| Source | Kind | Notes |
| --- | --- | --- |
| **[`yc-oss/api`](https://github.com/yc-oss/api)** | companies | ~4,300 YC startups, pre-tagged. Credit **yc-oss** + **Y Combinator**. |
| **[`datasets/s-and-p-500-companies`](https://github.com/datasets/s-and-p-500-companies)** | companies | ~500 large firms; GICS sector/sub-industry become tags. Open Data Commons **PDDL** (public domain). Website + description backfilled from **Wikidata** (`npm run data:enrich`, vendored to `sp500-enrichment.json`). |
| `supabase/seed/curated-listings.json` | research labs, programs, opportunities | ~50 hand-authored entries (ALERTCalifornia, UCSD REHS, Salk, SIMR, RSI, NYU ARISE, Fred Hutch SHIP, ASSIP, Oak Ridge, NASA OSTEM, Google CSSI, …) across many universities. Verify specifics before relying on them. |
| **[OpenAlex](https://openalex.org)** | research labs | ~3,900 university research groups across 54 schools (`npm run data:gen`, vendored to `university-labs.json`). Each is a disambiguated PI's public research area (ORCID-filtered), tagged by field/subfield, located at the university. CC0. **Not** a claim the lab accepts high schoolers — `is_recruiting=false` and no "accepting" status is shown. |

Company **logos** are shown as favicons derived from each listing's website host no logo dataset needed :) .


## Usage

Free to use will be hosted at venit.org in the future. Personal identifying information is NEVER stored or shared. 
