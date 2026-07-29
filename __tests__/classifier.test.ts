import { describe, it, expect } from "vitest";
import {
  assignInterestTags,
  snapOrCreateNiche,
  classifyPersonality,
  buildClassifierResult,
  toStudentPayload,
} from "../lib/classifier";
import { scrubPII } from "../lib/pii";
import type { ArchetypeVector, TagVector } from "../lib/match-types";

/** L2-normalize a small synthetic vector so its dot product with another equals cosine. */
function norm(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return n === 0 ? v.slice() : v.map((x) => x / n);
}

// Four orthogonal-ish 4-dim tags so cosine is easy to reason about.
const TAGS: TagVector[] = [
  { slug: "alpha", label: "Alpha", domain: "x", vector: norm([1, 0, 0, 0]) },
  { slug: "beta", label: "Beta", domain: "x", vector: norm([0.9, 0.2, 0, 0]) },
  { slug: "gamma", label: "Gamma", domain: "x", vector: norm([0, 1, 0, 0]) },
  { slug: "delta", label: "Delta", domain: "x", vector: norm([0, 0, 1, 0]) },
];

describe("assignInterestTags", () => {
  it("keeps only tags scoring at or above the threshold", () => {
    const user = norm([1, 0.1, 0, 0]); // close to alpha/beta, far from gamma/delta
    const slugs = assignInterestTags(user, TAGS, { threshold: 0.5 });
    expect(slugs).toContain("alpha");
    expect(slugs).toContain("beta");
    expect(slugs).not.toContain("gamma");
    expect(slugs).not.toContain("delta");
  });

  it("caps the result at topK by descending similarity", () => {
    const user = norm([4, 3, 2, 1]); // distinct cosine with each tag: beta > alpha > gamma > delta
    const slugs = assignInterestTags(user, TAGS, { threshold: 0, topK: 2 });
    expect(slugs.length).toBe(2);
    expect(slugs).toEqual(["beta", "alpha"]); // two highest, in descending order
  });

  it("always merges explicit picks even when they fall below threshold, deduped", () => {
    const user = norm([1, 0, 0, 0]); // only alpha clears a high threshold
    const slugs = assignInterestTags(user, TAGS, {
      threshold: 0.99,
      explicit: ["gamma", "alpha"],
    });
    expect(slugs).toContain("gamma"); // explicit despite ~0 similarity
    expect(slugs).toContain("alpha");
    expect(slugs.filter((s) => s === "alpha").length).toBe(1); // deduped
  });
});

describe("snapOrCreateNiche", () => {
  it("snaps to the nearest tag when the best match is at or above threshold", () => {
    const niche = norm([1, 0, 0, 0]); // exactly alpha, cosine 1
    const res = snapOrCreateNiche("some niche", niche, TAGS, 0.9);
    expect(res).toEqual({ snappedSlug: "alpha" });
  });

  it("creates a custom request when nothing clears the threshold", () => {
    const niche = norm([0, 0, 0, 1]); // orthogonal to every tag, cosine 0
    const res = snapOrCreateNiche("brand new field", niche, TAGS, 0.3);
    expect("customRequest" in res).toBe(true);
    if ("customRequest" in res) {
      expect(res.customRequest.text).toBe("brand new field");
      expect(res.customRequest.vector).toEqual(niche);
    }
  });

  it("snaps exactly at the threshold boundary (>= is inclusive)", () => {
    const niche = norm([1, 0, 0, 0]);
    const exact = snapOrCreateNiche("edge", niche, TAGS, 1.0); // best cosine == 1.0
    expect(exact).toEqual({ snappedSlug: "alpha" });
    const above = snapOrCreateNiche("edge", niche, TAGS, 1.0000001); // just above best
    expect("customRequest" in above).toBe(true);
  });
});

// Eight 8-dim archetypes on distinct axes so similarity ordering is unambiguous.
const ARCHETYPES: ArchetypeVector[] = Array.from({ length: 8 }, (_, i) => {
  const v = new Array(8).fill(0);
  v[i] = 1;
  return { slug: `arch-${i}`, label: `Arch ${i}`, vector: v };
});

describe("classifyPersonality", () => {
  it("returns an L2-normalized blend vector of the archetype dimension", () => {
    const adj = norm([1, 0.5, 0.2, 0, 0, 0, 0, 0]);
    const res = classifyPersonality(adj, ARCHETYPES);
    expect(res.vector.length).toBe(8); // dimension-agnostic: matches archetype dim
    const len = Math.sqrt(res.vector.reduce((a, x) => a + x * x, 0));
    expect(len).toBeCloseTo(1, 6); // L2-normalized
  });

  it("orders top archetypes by similarity (higher similarity → higher weight)", () => {
    // Descending overlap with axes 0,1,2 → arch-0 most similar, then arch-1, then arch-2.
    const adj = norm([0.9, 0.6, 0.3, 0, 0, 0, 0, 0]);
    const res = classifyPersonality(adj, ARCHETYPES, { topN: 3 });
    expect(res.archetypes).toEqual(["arch-0", "arch-1", "arch-2"]);
  });

  it("returns exactly topN archetype slugs", () => {
    const adj = norm([1, 0.5, 0.25, 0.1, 0, 0, 0, 0]);
    expect(classifyPersonality(adj, ARCHETYPES, { topN: 2 }).archetypes.length).toBe(2);
    expect(classifyPersonality(adj, ARCHETYPES, { topN: 5 }).archetypes.length).toBe(5);
  });

  it("softmax weights are implicitly normalized: blend leans toward the closest archetype", () => {
    // With a peaky temperature the blend should point mostly along the nearest axis (arch-0).
    const adj = norm([1, 0.2, 0, 0, 0, 0, 0, 0]);
    const res = classifyPersonality(adj, ARCHETYPES, { temperature: 0.05 });
    const dominant = res.vector.indexOf(Math.max(...res.vector));
    expect(dominant).toBe(0);
    // Weights sum to 1 by softmax construction ⇒ a normalized blend of unit axes has each
    // component in [0,1]; the dominant one is the largest.
    expect(res.vector[0]).toBeGreaterThan(res.vector[1]);
  });
});

describe("scrubPII", () => {
  it("removes an email, phone number, and SSN and reports each", () => {
    const text =
      "Reach me at jane.doe@example.com or (415) 555-0132. SSN 123-45-6789.";
    const { cleaned, stripped } = scrubPII(text);
    expect(cleaned).not.toContain("jane.doe@example.com");
    expect(cleaned).not.toContain("555-0132");
    expect(cleaned).not.toContain("123-45-6789");
    const kinds = stripped.map((s) => s.kind);
    expect(kinds).toContain("email");
    expect(kinds).toContain("phone");
    expect(kinds).toContain("ssn");
    expect(stripped.find((s) => s.kind === "email")?.value).toBe("jane.doe@example.com");
  });

  it("redacts a street address best-effort", () => {
    const { cleaned, stripped } = scrubPII("I live at 123 Main Street, Apt 4.");
    expect(cleaned).toContain("[REDACTED_ADDRESS]");
    expect(stripped.some((s) => s.kind === "address")).toBe(true);
  });

  it("leaves text with no PII untouched", () => {
    const clean = "I love robotics, machine learning, and marine biology.";
    const { cleaned, stripped } = scrubPII(clean);
    expect(cleaned).toBe(clean);
    expect(stripped.length).toBe(0);
  });
});

describe("guardrail §0.1 — student payload carries no personality data", () => {
  const personality = classifyPersonality(
    norm([1, 0.5, 0.2, 0, 0, 0, 0, 0]),
    ARCHETYPES,
    { topN: 3 },
  );
  const result = buildClassifierResult({
    interestTagSlugs: ["alpha", "beta"],
    niches: [
      snapOrCreateNiche("x", norm([1, 0, 0, 0]), TAGS, 0.9), // snaps → alpha
      snapOrCreateNiche("novel", norm([0, 0, 0, 1]), TAGS, 0.3), // custom request
    ],
    personality,
  });

  it("buildClassifierResult folds snapped niches into interest tags and keeps custom requests", () => {
    expect(result.interestTagSlugs).toContain("alpha");
    expect(result.interestTagSlugs).toContain("beta");
    expect(result.customTagRequests.length).toBe(1);
    expect(result.customTagRequests[0].text).toBe("novel");
  });

  it("toStudentPayload exposes only interest tags + custom requests", () => {
    const payload = toStudentPayload(result);
    expect(Object.keys(payload).sort()).toEqual(["customTagRequests", "interestTagSlugs"]);
    expect("personality" in payload).toBe(false);
  });

  it("the serialized student payload contains no personality vector or archetype slug", () => {
    const json = JSON.stringify(toStudentPayload(result));
    expect(json).not.toContain("personality");
    expect(json).not.toContain("archetypes");
    for (const slug of personality.archetypes) {
      expect(json).not.toContain(slug); // no arch-* slug leaks through
    }
    // The secret vector's exact components must not appear anywhere in the payload.
    for (const component of personality.vector) {
      expect(json).not.toContain(String(component));
    }
  });
});
