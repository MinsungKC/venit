import type { NormalizedListing } from "../mapping";
import { loadYcListings } from "./yc";
import { loadSp500Listings } from "./sp500";
import { loadCuratedListings } from "./curated";

/**
 * Load and concatenate every source adapter. Order matters only for slug/dedup
 * tie-breaks; buildDataset() handles cross-source dedup and tag aggregation.
 */
export function loadAllListings(): NormalizedListing[] {
  return [...loadCuratedListings(), ...loadSp500Listings(), ...loadYcListings()];
}
