import { describe, it, expect } from "vitest";
import { parseItemsParam, toggleSlug, orderBySlugs } from "../lib/shortlist";

describe("parseItemsParam", () => {
  it("splits, trims, and de-dupes a shared-shortlist param", () => {
    expect(parseItemsParam("mit-rsi, salk-hs-scholars , mit-rsi")).toEqual([
      "mit-rsi",
      "salk-hs-scholars",
    ]);
  });
  it("returns [] for empty input", () => {
    expect(parseItemsParam(undefined)).toEqual([]);
    expect(parseItemsParam("")).toEqual([]);
  });
});

describe("toggleSlug", () => {
  it("adds a slug that is absent (appended to the end)", () => {
    expect(toggleSlug(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });
  it("removes a slug that is present", () => {
    expect(toggleSlug(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
  it("does not mutate the input", () => {
    const input = ["a"];
    toggleSlug(input, "b");
    expect(input).toEqual(["a"]);
  });
});

describe("orderBySlugs", () => {
  const listings = [
    { slug: "a", n: 1 },
    { slug: "b", n: 2 },
    { slug: "c", n: 3 },
  ];
  it("returns listings in the saved slug order", () => {
    expect(orderBySlugs(listings, ["c", "a"]).map((l) => l.slug)).toEqual(["c", "a"]);
  });
  it("skips slugs with no matching listing", () => {
    expect(orderBySlugs(listings, ["b", "missing", "a"]).map((l) => l.slug)).toEqual(["b", "a"]);
  });
});
