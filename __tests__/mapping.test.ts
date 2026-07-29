import { describe, it, expect } from "vitest";
import {
  slugify,
  truncate,
  locationName,
  isRemote,
  costType,
  tagLabels,
  mapCompany,
  buildDataset,
  type YcCompany,
} from "../lib/mapping";

const base = (over: Partial<YcCompany>): YcCompany => ({
  id: 1,
  name: "Acme",
  slug: "acme",
  status: "Active",
  tags: ["Robotics"],
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
    expect(locationName("London, England, UK; Berlin, Germany")).toBe(
      "London, England, UK",
    );
  });
  it("returns null when empty", () => {
    expect(locationName(null)).toBeNull();
  });
});

describe("isRemote", () => {
  it("is true when regions include Remote", () => {
    expect(isRemote(base({ regions: ["United States", "Remote"] }))).toBe(true);
  });
  it("is true when all_locations mentions remote", () => {
    expect(isRemote(base({ all_locations: "Remote" }))).toBe(true);
  });
  it("is false otherwise", () => {
    expect(isRemote(base({ regions: ["United States"], all_locations: "SF" }))).toBe(false);
  });
});

describe("costType", () => {
  it("is unknown for a company", () => {
    expect(costType(base({}))).toBe("unknown");
  });
});

describe("tagLabels", () => {
  it("dedupes case-variant tags by slug", () => {
    expect(tagLabels(base({ tags: ["AI", "ai", "Robotics"] }))).toEqual(["AI", "Robotics"]);
  });
});

describe("mapCompany", () => {
  it("maps core fields and marks recruiting from isHiring", () => {
    const l = mapCompany(
      base({
        id: 42,
        name: "CircuitHub",
        slug: "circuithub",
        website: "https://circuithub.com",
        one_liner: "On-Demand Electronics Manufacturing",
        team_size: 58,
        all_locations: "London, England, United Kingdom",
        industry: "Industrials",
        subindustry: "Industrials -> Manufacturing and Robotics",
        isHiring: true,
      }),
    );
    expect(l.external_id).toBe("42");
    expect(l.kind).toBe("company");
    expect(l.status).toBe("approved");
    expect(l.url).toBe("https://circuithub.com");
    expect(l.is_recruiting).toBe(true);
    expect(l.subindustry).toBe("Manufacturing and Robotics");
    expect(l.location_name).toBe("London, England, United Kingdom");
  });
});

describe("buildDataset (guardrails + aggregation)", () => {
  const companies: YcCompany[] = [
    base({ id: 1, name: "Tagged Co", tags: ["Robotics", "Hardware"], industry: "Industrials" }),
    base({ id: 2, name: "No Tags Co", tags: [] }), // must be dropped (§0.4)
    base({ id: 3, name: "Dead Co", status: "Inactive", tags: ["AI"] }), // dropped
    base({ id: 4, name: "Ai Co", tags: ["AI"], industry: "B2B" }),
    base({ id: 5, name: "Ai Co Two", tags: ["AI"], industry: "B2B" }),
  ];
  const { listings, tags } = buildDataset(companies);

  it("drops companies with zero tags", () => {
    expect(listings.find((l) => l.title === "No Tags Co")).toBeUndefined();
  });
  it("drops dead companies", () => {
    expect(listings.find((l) => l.title === "Dead Co")).toBeUndefined();
  });
  it("never emits an approved listing without >=1 tag", () => {
    for (const l of listings) {
      expect(l.status).toBe("approved");
      expect(l.tag_slugs.length).toBeGreaterThan(0);
    }
  });
  it("assigns each tag its most common industry as domain", () => {
    const ai = tags.find((t) => t.slug === "ai");
    expect(ai?.domain).toBe("B2B"); // AI appears twice under B2B
  });
  it("dedupes slugs across companies", () => {
    const slugs = listings.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
