import { describe, it, expect } from "vitest";
import { slugify } from "../lib/mapping";
import taxonomy from "../supabase/seed/taxonomy.json";

interface Tag {
  slug: string;
  label: string;
  domain: string;
  description: string;
}

describe("canonical taxonomy", () => {
  const tags = taxonomy as Tag[];

  it("has a healthy number of tags", () => {
    expect(tags.length).toBeGreaterThan(80);
  });
  it("has unique slugs", () => {
    const slugs = tags.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("each slug matches slugify(label) so classification links resolve", () => {
    for (const t of tags) expect(t.slug).toBe(slugify(t.label));
  });
  it("every tag has a domain and a non-trivial description (feeds the embedding)", () => {
    for (const t of tags) {
      expect(t.domain.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(15);
    }
  });
});
