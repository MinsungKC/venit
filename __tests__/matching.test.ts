import { describe, it, expect } from "vitest";
import { parseTagParam, sharedTagSlugs, matchByInterest } from "../lib/matching";

describe("parseTagParam", () => {
  it("splits, trims, lowercases, and de-dupes", () => {
    expect(parseTagParam("Biology, biology , robotics")).toEqual(["biology", "robotics"]);
  });
  it("returns [] for empty / nullish input", () => {
    expect(parseTagParam(undefined)).toEqual([]);
    expect(parseTagParam("")).toEqual([]);
    expect(parseTagParam(",  ,")).toEqual([]);
  });
  it("accepts an array (Next can hand back string[])", () => {
    expect(parseTagParam(["ai", "ai", "math"])).toEqual(["ai", "math"]);
  });
});

describe("sharedTagSlugs", () => {
  it("returns the intersection in the listing's order", () => {
    const shared = sharedTagSlugs(["robotics", "ai", "biology"], new Set(["biology", "ai"]));
    expect(shared).toEqual(["ai", "biology"]);
  });
  it("is empty when nothing overlaps", () => {
    expect(sharedTagSlugs(["art"], new Set(["math"]))).toEqual([]);
  });
});

describe("matchByInterest (guardrail §4)", () => {
  const listings = [
    { id: "a", tag_slugs: ["biology", "chemistry"] },
    { id: "b", tag_slugs: ["robotics", "ai", "biology"] },
    { id: "c", tag_slugs: ["history"] },
  ];

  it("drops listings that share no selected interest tag", () => {
    const out = matchByInterest(listings, ["biology"]);
    expect(out.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("annotates each kept listing with its shared-tag count", () => {
    const out = matchByInterest(listings, ["biology", "ai"]);
    expect(out.find((l) => l.id === "a")!.shared).toBe(1);
    expect(out.find((l) => l.id === "b")!.shared).toBe(2);
    expect(out.some((l) => l.id === "c")).toBe(false);
  });

  it("returns everything (shared: 0) when no interests are selected — browse mode", () => {
    const out = matchByInterest(listings, []);
    expect(out).toHaveLength(3);
    expect(out.every((l) => l.shared === 0)).toBe(true);
  });

  it("does not mutate the input listings", () => {
    const copy = structuredClone(listings);
    matchByInterest(listings, ["biology"]);
    expect(listings).toEqual(copy);
  });
});
