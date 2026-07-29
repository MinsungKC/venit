import { describe, it, expect } from "vitest";
import { mapSp500Row } from "../lib/sources/sp500";
import { mapCuratedEntry } from "../lib/sources/curated";
import { mapYcCompany, type YcCompany } from "../lib/sources/yc";

describe("mapSp500Row", () => {
  it("maps a constituent row and derives tags from sector + sub-industry", () => {
    const l = mapSp500Row({
      Symbol: "MMM",
      Security: "3M",
      "GICS Sector": "Industrials",
      "GICS Sub-Industry": "Industrial Conglomerates",
      "Headquarters Location": "Saint Paul, Minnesota",
    });
    expect(l).not.toBeNull();
    expect(l!.source).toBe("sp500");
    expect(l!.kind).toBe("company");
    expect(l!.external_id).toBe("MMM");
    expect(l!.location_name).toBe("Saint Paul, Minnesota");
    expect(l!.tag_labels).toEqual(["Industrials", "Industrial Conglomerates"]);
  });
  it("returns null when the name/symbol is missing", () => {
    expect(mapSp500Row({ Symbol: "", Security: "" })).toBeNull();
  });
});

describe("mapCuratedEntry", () => {
  it("maps a research lab with explicit tags and location", () => {
    const l = mapCuratedEntry({
      id: "alertcalifornia",
      kind: "research_lab",
      title: "ALERTCalifornia",
      location_name: "La Jolla, California",
      tags: ["Climate", "Wildfire"],
    });
    expect(l.source).toBe("curated");
    expect(l.kind).toBe("research_lab");
    expect(l.is_recruiting).toBe(true); // defaults to accepting
    expect(l.tag_labels).toEqual(["Climate", "Wildfire"]);
  });
  it("throws when a research lab has neither a location nor remote flag (§0.5)", () => {
    expect(() =>
      mapCuratedEntry({ id: "x", kind: "research_lab", title: "Nowhere Lab", tags: ["AI"] }),
    ).toThrow(/location/i);
  });
});

describe("mapYcCompany", () => {
  it("maps core fields, recruiting from isHiring, and strips subindustry prefix", () => {
    const c: YcCompany = {
      id: 5,
      name: "CircuitHub",
      slug: "circuithub",
      website: "https://circuithub.com",
      one_liner: "On-Demand Electronics Manufacturing",
      team_size: 58,
      all_locations: "London, England, United Kingdom",
      industry: "Industrials",
      subindustry: "Industrials -> Manufacturing and Robotics",
      tags: ["Hardware", "Robotics"],
      status: "Active",
      isHiring: true,
    };
    const l = mapYcCompany(c);
    expect(l.external_id).toBe("5");
    expect(l.is_recruiting).toBe(true);
    expect(l.subindustry).toBe("Manufacturing and Robotics");
    expect(l.tag_labels).toEqual(["Hardware", "Robotics"]);
  });
});
