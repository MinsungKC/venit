import { describe, it, expect } from "vitest";
import {
  extractAgeMin,
  extractQualifications,
  htmlToText,
  isStudentRole,
} from "../lib/sources/ats-parse";

describe("isStudentRole", () => {
  it("matches intern / co-op / apprentice / early-career / fellowship titles", () => {
    for (const t of [
      "Software Engineering Intern",
      "Data Co-op",
      "Manufacturing Apprentice",
      "Early Career Analyst",
      "Research Fellowship",
      "Summer Analyst",
    ]) {
      expect(isStudentRole(t)).toBe(true);
    }
  });

  it("rejects ordinary full-time titles", () => {
    expect(isStudentRole("Software Engineer")).toBe(false);
    expect(isStudentRole("Account Executive")).toBe(false);
  });

  it("excludes senior roles even when they contain a relevant word", () => {
    expect(isStudentRole("Senior Internal Auditor")).toBe(false);
    expect(isStudentRole("Internship Program Manager")).toBe(false);
  });
});

describe("htmlToText", () => {
  it("strips tags and decodes entities", () => {
    expect(htmlToText("<p>Hello&nbsp;&amp; welcome</p>")).toBe("Hello & welcome");
  });

  it("handles Greenhouse double-encoding (&amp;nbsp;)", () => {
    // Source arrives HTML-escaped, so a literal &nbsp; shows up as &amp;nbsp;.
    expect(htmlToText("Required:&amp;nbsp;a resume")).toBe("Required: a resume");
    expect(htmlToText("A&amp;amp;B")).toBe("A&B");
  });

  it("decodes numeric entities and collapses whitespace", () => {
    expect(htmlToText("a&#39;b   c\n\nd")).toBe("a'b c d");
  });
});

describe("extractQualifications", () => {
  it("starts the snippet at a requirements/qualifications heading", () => {
    const text = "About us: we are great. Requirements: must know Python and SQL.";
    expect(extractQualifications(text)).toBe("Requirements: must know Python and SQL.");
  });

  it("falls back to the whole description when there's no heading", () => {
    expect(extractQualifications("Join our summer program.")).toBe("Join our summer program.");
  });

  it("truncates long snippets with an ellipsis", () => {
    const long = "Qualifications: " + "word ".repeat(200);
    const out = extractQualifications(long)!;
    expect(out.length).toBeLessThanOrEqual(481);
    expect(out.endsWith("…")).toBe(true);
  });

  it("returns null for empty text", () => {
    expect(extractQualifications("")).toBeNull();
  });
});

describe("extractAgeMin", () => {
  it("parses a stated minimum age", () => {
    expect(extractAgeMin("Applicants must be at least 16 years of age.")).toBe(16);
    expect(extractAgeMin("You must be 18 years old to apply.")).toBe(18);
    expect(extractAgeMin("Minimum age of 15 required.")).toBe(15);
  });

  it("ignores implausible ages (outside 14–21)", () => {
    expect(extractAgeMin("must be 40 years of age")).toBeNull();
    expect(extractAgeMin("at least 5 years of experience")).toBeNull();
  });

  it("returns null when no age is stated", () => {
    expect(extractAgeMin("Great internship opportunity.")).toBeNull();
    expect(extractAgeMin("")).toBeNull();
  });
});
