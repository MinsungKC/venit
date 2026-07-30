/**
 * Approximate US state geographic centroids, used for coarse location matching (BUILD_PROMPT §5 /
 * §0.5). The listings dataset has no per-listing coordinates, so we geocode at the state level:
 * a listing's region → its state centroid, the student picks a state → its centroid. Same-state
 * distance is 0 (identical centroids), so with a generous radius a research lab matches students
 * in its state and immediate neighbors. Coarse on purpose — enough to keep an in-person lab local
 * without collecting precise student location.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Full state name → centroid. Regions in the dataset (OpenAlex) use full names. */
export const STATE_CENTROIDS: Record<string, LatLng> = {
  Alabama: { lat: 32.8, lng: -86.8 },
  Alaska: { lat: 64.2, lng: -149.5 },
  Arizona: { lat: 34.3, lng: -111.7 },
  Arkansas: { lat: 34.9, lng: -92.4 },
  California: { lat: 37.2, lng: -119.3 },
  Colorado: { lat: 39.0, lng: -105.5 },
  Connecticut: { lat: 41.6, lng: -72.7 },
  Delaware: { lat: 39.0, lng: -75.5 },
  "District of Columbia": { lat: 38.9, lng: -77.0 },
  Florida: { lat: 28.6, lng: -82.4 },
  Georgia: { lat: 32.6, lng: -83.4 },
  Hawaii: { lat: 20.3, lng: -156.4 },
  Idaho: { lat: 44.4, lng: -114.6 },
  Illinois: { lat: 40.0, lng: -89.2 },
  Indiana: { lat: 39.9, lng: -86.3 },
  Iowa: { lat: 42.0, lng: -93.5 },
  Kansas: { lat: 38.5, lng: -98.4 },
  Kentucky: { lat: 37.5, lng: -85.3 },
  Louisiana: { lat: 31.1, lng: -92.0 },
  Maine: { lat: 45.4, lng: -69.2 },
  Maryland: { lat: 39.0, lng: -76.8 },
  Massachusetts: { lat: 42.3, lng: -71.8 },
  Michigan: { lat: 44.3, lng: -85.4 },
  Minnesota: { lat: 46.3, lng: -94.3 },
  Mississippi: { lat: 32.7, lng: -89.7 },
  Missouri: { lat: 38.4, lng: -92.5 },
  Montana: { lat: 47.0, lng: -109.6 },
  Nebraska: { lat: 41.5, lng: -99.8 },
  Nevada: { lat: 39.3, lng: -116.6 },
  "New Hampshire": { lat: 43.7, lng: -71.6 },
  "New Jersey": { lat: 40.2, lng: -74.7 },
  "New Mexico": { lat: 34.4, lng: -106.1 },
  "New York": { lat: 42.9, lng: -75.6 },
  "North Carolina": { lat: 35.6, lng: -79.4 },
  "North Dakota": { lat: 47.5, lng: -100.5 },
  Ohio: { lat: 40.3, lng: -82.8 },
  Oklahoma: { lat: 35.6, lng: -97.5 },
  Oregon: { lat: 44.0, lng: -120.5 },
  Pennsylvania: { lat: 40.9, lng: -77.8 },
  "Rhode Island": { lat: 41.7, lng: -71.5 },
  "South Carolina": { lat: 33.9, lng: -80.9 },
  "South Dakota": { lat: 44.4, lng: -100.2 },
  Tennessee: { lat: 35.9, lng: -86.4 },
  Texas: { lat: 31.5, lng: -99.3 },
  Utah: { lat: 39.3, lng: -111.7 },
  Vermont: { lat: 44.1, lng: -72.7 },
  Virginia: { lat: 37.5, lng: -78.9 },
  Washington: { lat: 47.4, lng: -120.5 },
  "West Virginia": { lat: 38.6, lng: -80.6 },
  Wisconsin: { lat: 44.6, lng: -89.9 },
  Wyoming: { lat: 43.0, lng: -107.6 },
};

const ABBREV: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** Sorted full state names, for a dropdown. */
export const STATE_NAMES = Object.keys(STATE_CENTROIDS).sort();

/** Resolve a full name or 2-letter abbreviation to its canonical full state name, if known. */
export function canonicalState(region: string | null | undefined): string | null {
  if (!region) return null;
  const trimmed = region.trim();
  if (STATE_CENTROIDS[trimmed]) return trimmed;
  const up = trimmed.toUpperCase();
  if (ABBREV[up]) return ABBREV[up];
  // Case-insensitive full-name match.
  const hit = STATE_NAMES.find((n) => n.toLowerCase() === trimmed.toLowerCase());
  return hit ?? null;
}

/** Centroid for a region string ("California", "CA", or "City, California"). null if unknown. */
export function regionToLatLng(region: string | null | undefined): LatLng | null {
  if (!region) return null;
  // Accept "City, State" by taking the part after the last comma.
  const tail = region.includes(",") ? region.slice(region.lastIndexOf(",") + 1) : region;
  const name = canonicalState(tail) ?? canonicalState(region);
  return name ? STATE_CENTROIDS[name] : null;
}
