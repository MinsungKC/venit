import { describe, it, expect } from "vitest";
import {
  slugify,
  truncate,
  locationName,
  priceToCost,
  buildDataset,
  type NormalizedListing,
} from "../lib/mapping";

const nl = (over: Partial<NormalizedListing>): NormalizedListing => ({
  external_id: "1",
  source: "yc",
  kind: "company",
  title: "Acme",
  url: null,
  short_description: null,
  long_description: null,
  location_name: null,
  is_remote: false,
  team_size: null,
  industry: null,
  subindustry: null,
  cost_type: "unknown",
  is_recruiting: false,
  badges: [],
  status: "approved",
  grade_min: null,
  grade_max: null,
  deadline: null,
  tag_labels: ["Robotics"],
  ...over,
});

describe("slugify", () => {
  it("lowercases and dashes non-alphanumerics", () => {
    expect(slugify("AI / Machine Learning!")).toBe("ai-machine-learning");
  });
  it("trims leading/trailing dashes", () => {
    expect(slugify("  --Hard Tech-- ")).toBe("hard-tech");
  });
});

describe("truncate", () => {
  it("leaves short text untouched", () => {
    expect(truncate("short", 300)).toBe("short");
  });
  it("caps long text with an ellipsis", () => {
    const out = truncate("word ".repeat(200), 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("locationName", () => {
  it("takes the first location", () => {
    expect(locationName("London, England, UK; Berlin, Germany")).toBe("London, England, UK");
  });
  it("returns null when empty", () => {
    expect(locationName(null)).toBeNull();
  });
});

describe("priceToCost", () => {
  it("maps 0 to free, positive to paid, missing to unknown", () => {
    expect(priceToCost(0)).toBe("free");
    expect(priceToCost(500)).toBe("paid");
    expect(priceToCost(null)).toBe("unknown");
    expect(priceToCost(undefined)).toBe("unknown");
  });
});

describe("buildDataset (guardrails + cross-source merge)", () => {
  const items: NormalizedListing[] = [
    nl({ source: "yc", external_id: "1", title: "Tagged Co", tag_labels: ["Robotics", "Hardware"], industry: "Industrials" }),
    nl({ source: "yc", external_id: "2", title: "No Tags Co", tag_labels: [] }), // dropped (§0.4)
    nl({ source: "yc", external_id: "1", title: "Dup Co", tag_labels: ["AI"] }), // dup of yc:1
    nl({ source: "sp500", external_id: "1", title: "Same Id Diff Source", tag_labels: ["AI"], industry: "B2B" }),
    nl({ source: "yc", external_id: "9", title: "Ai Co", tag_labels: ["AI"], industry: "B2B" }),
    nl({ source: "curated", external_id: "acme", title: "Acme", tag_labels: ["Climate"] }),
  ];
  const { listings, tags } = buildDataset(items);

  it("drops listings with zero tags", () => {
    expect(listings.find((l) => l.title === "No Tags Co")).toBeUndefined();
  });
  it("dedupes by (source, external_id) but keeps same id across sources", () => {
    expect(listings.filter((l) => l.source === "yc" && l.external_id === "1")).toHaveLength(1);
    expect(listings.find((l) => l.source === "sp500" && l.external_id === "1")).toBeDefined();
  });
  it("never emits an approved listing without >=1 tag", () => {
    for (const l of listings) {
      expect(l.status).toBe("approved");
      expect(l.tag_slugs.length).toBeGreaterThan(0);
    }
  });
  it("assigns each tag its most common industry as domain", () => {
    const ai = tags.find((t) => t.slug === "ai");
    expect(ai?.domain).toBe("B2B"); // AI appears under B2B twice
  });
  it("enforces unique slugs across sources", () => {
    const slugs = listings.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
