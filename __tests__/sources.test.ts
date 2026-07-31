import { describe, it, expect } from "vitest";
import { mapSp500Row } from "../lib/sources/sp500";
import { mapCuratedEntry } from "../lib/sources/curated";
import { mapYcCompany, type YcCompany } from "../lib/sources/yc";
import { mapUniversityLab } from "../lib/sources/universityLabs";
import { mapCompanyEntry } from "../lib/sources/companies";
import { mapVolunteerEntry } from "../lib/sources/volunteering";
import { mapAtsJob } from "../lib/sources/atsJobs";

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
  it("uses Wikidata enrichment for url and description when present", () => {
    const l = mapSp500Row(
      { Symbol: "AAPL", Security: "Apple", "GICS Sector": "Information Technology" },
      { website: "https://apple.com/", description: "American technology company" },
    );
    expect(l!.url).toBe("https://apple.com/");
    expect(l!.short_description).toBe("American technology company");
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

describe("mapUniversityLab", () => {
  it("maps an OpenAlex research group to a located research_lab with field tags", () => {
    const l = mapUniversityLab({
      id: "A5023888391",
      name: "Napoleone Ferrara",
      url: "https://orcid.org/0000-0001-0000-0000",
      university: "University of California, San Diego",
      location: "San Diego, California",
      field: "Biochemistry, Genetics and Molecular Biology",
      primary_topic: "Angiogenesis and VEGF in Cancer",
      tags: ["Cancer Research", "Molecular Biology"],
    });
    expect(l.source).toBe("openalex");
    expect(l.kind).toBe("research_lab");
    expect(l.location_name).toBe("San Diego, California"); // §0.5: labs need a location
    expect(l.is_recruiting).toBe(false); // HS policy unknown
    expect(l.badges).toContain("openalex");
    expect(l.short_description).toContain("University of California, San Diego");
    expect(l.tag_labels).toEqual(["Cancer Research", "Molecular Biology"]);
  });
});

describe("mapCompanyEntry", () => {
  it("maps a curated company with its canonical tags", () => {
    const l = mapCompanyEntry({
      id: "figma",
      name: "Figma",
      website: "https://www.figma.com",
      industry: "Design Software",
      is_recruiting: true,
      ats: { provider: "greenhouse", token: "figma" },
      tags: ["Graphic & UX Design", "Software Engineering"],
    });
    expect(l.source).toBe("companies");
    expect(l.kind).toBe("company");
    expect(l.is_recruiting).toBe(true);
    expect(l.tag_labels).toEqual(["Graphic & UX Design", "Software Engineering"]);
  });
});

describe("mapVolunteerEntry", () => {
  it("maps a volunteering org to the volunteer kind (free, recruiting)", () => {
    const l = mapVolunteerEntry({
      id: "habitat",
      name: "Habitat for Humanity",
      url: "https://www.habitat.org/volunteer",
      short_description: "Build affordable housing.",
      tags: ["Nonprofit & Community", "Civil Engineering"],
    });
    expect(l.kind).toBe("volunteer");
    expect(l.source).toBe("volunteering");
    expect(l.cost_type).toBe("free");
    expect(l.is_recruiting).toBe(true);
    expect(l.tag_labels).toEqual(["Nonprofit & Community", "Civil Engineering"]);
  });

  it("carries an age minimum when the org states one (e.g. 18+ crisis lines)", () => {
    const l = mapVolunteerEntry({
      id: "crisis",
      name: "Crisis Text Line",
      is_remote: true,
      age_min: 18,
      tags: ["Mental Health"],
    });
    expect(l.age_min).toBe(18);
    expect(l.is_remote).toBe(true);
  });
});

describe("mapAtsJob", () => {
  it("maps an ATS posting to a recruiting opportunity with an apply link + qualifications", () => {
    const l = mapAtsJob({
      id: "greenhouse:figma:123",
      company_id: "figma",
      company_name: "Figma",
      company_website: "https://www.figma.com",
      provider: "greenhouse",
      title: "Software Engineering Intern",
      apply_url: "https://boards.greenhouse.io/figma/jobs/123",
      location_name: "San Francisco, CA",
      is_remote: false,
      department: "Engineering",
      qualifications: "Requirements: pursuing a CS degree.",
      age_min: null,
      posted_at: "2026-07-01",
      tags: ["Software Engineering"],
    });
    expect(l.kind).toBe("opportunity");
    expect(l.source).toBe("ats");
    expect(l.is_recruiting).toBe(true);
    expect(l.apply_url).toBe("https://boards.greenhouse.io/figma/jobs/123");
    expect(l.long_description).toBe("Requirements: pursuing a CS degree."); // qualifications shown as body
    expect(l.title).toBe("Software Engineering Intern — Figma");
    expect(l.tag_labels).toEqual(["Software Engineering"]);
    expect(l.badges).toContain("ats");
  });

  it("marks a remote posting as remote with no location", () => {
    const l = mapAtsJob({
      id: "ashby:notion:9",
      company_id: "notion",
      company_name: "Notion",
      company_website: "https://www.notion.so",
      provider: "ashby",
      title: "Data Intern",
      apply_url: "https://jobs.ashbyhq.com/notion/9/application",
      location_name: "Remote - US",
      is_remote: true,
      department: null,
      qualifications: null,
      age_min: 16,
      posted_at: null,
      tags: ["Data Science"],
    });
    expect(l.is_remote).toBe(true);
    expect(l.location_name).toBeNull();
    expect(l.age_min).toBe(16);
  });
});
