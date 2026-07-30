import { describe, it, expect } from "vitest";
import { canonicalState, regionToLatLng, STATE_NAMES } from "../lib/us-states";

describe("us-states geocoding", () => {
  it("has all 50 states plus DC", () => {
    expect(STATE_NAMES.length).toBe(51);
  });

  it("resolves full names, abbreviations, and 'City, State'", () => {
    expect(canonicalState("California")).toBe("California");
    expect(canonicalState("ca")).toBe("California");
    expect(canonicalState("New York")).toBe("New York");
    expect(regionToLatLng("La Jolla, California")).toEqual(regionToLatLng("California"));
  });

  it("returns null for unknown regions", () => {
    expect(canonicalState("Ontario")).toBeNull();
    expect(regionToLatLng(null)).toBeNull();
    expect(regionToLatLng("Nowhere")).toBeNull();
  });

  it("same-state centroids are identical, so same-state distance is zero", () => {
    // The matcher relies on this: a lab and a student in the same state share a centroid.
    expect(regionToLatLng("Boston, Massachusetts")).toEqual(regionToLatLng("Massachusetts"));
  });
});
