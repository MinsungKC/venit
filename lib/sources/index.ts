import type { NormalizedListing } from "../mapping";
import { loadYcListings } from "./yc";
import { loadSp500Listings } from "./sp500";
import { loadCuratedListings } from "./curated";
import { loadUniversityLabListings } from "./universityLabs";
import { loadCompanyListings } from "./companies";
import { loadVolunteerListings } from "./volunteering";
import { loadAtsJobListings } from "./atsJobs";

/**
 * Load and concatenate every source adapter. Order matters for cross-source company dedup
 * (buildDataset keeps the FIRST company seen per host/name), so richer/primary company sources
 * (yc, sp500) come before the curated `companies` list — a curated entry that duplicates a YC or
 * S&P company is dropped, while genuinely new companies are kept. ATS job postings are a distinct
 * kind (`opportunity`) and aren't affected by company dedup.
 */
export function loadAllListings(): NormalizedListing[] {
  return [
    ...loadCuratedListings(),
    ...loadUniversityLabListings(),
    ...loadSp500Listings(),
    ...loadYcListings(),
    ...loadCompanyListings(),
    ...loadVolunteerListings(),
    ...loadAtsJobListings(),
  ];
}
