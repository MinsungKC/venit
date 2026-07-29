import { describe, it, expect } from "vitest";
import { slugify } from "../lib/mapping";
import personality from "../supabase/seed/personality.json";

interface Archetype {
  slug: string;
  label: string;
  description: string;
  adjectives: string[];
  anchor_text: string;
}

describe("personality archetypes", () => {
  const archetypes = personality as Archetype[];

  it("is the fixed set of 10 archetypes (BUILD_PROMPT §2a)", () => {
    expect(archetypes.length).toBe(10);
  });
  it("has unique slugs", () => {
    const slugs = archetypes.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("each slug matches slugify(label) so vector links resolve", () => {
    for (const a of archetypes) expect(a.slug).toBe(slugify(a.label));
  });
  it("every archetype has adjectives and a non-trivial anchor_text (feeds the embedding)", () => {
    for (const a of archetypes) {
      expect(a.adjectives.length).toBeGreaterThan(2);
      expect(a.anchor_text.length).toBeGreaterThan(30);
      // Guardrail §1: the anchor is the only text that ever meets an embedding.
      // It must carry the definition + synonyms, not a bare label.
      expect(a.anchor_text).toContain(a.description);
    }
  });
});
