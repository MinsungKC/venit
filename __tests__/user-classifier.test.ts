import { describe, it, expect } from "vitest";
import { classifyUser, type UserClassifierDeps } from "../lib/user-classifier";
import type { ArchetypeVector, TagVector } from "../lib/match-types";

// Tiny synthetic 3-dim reference space so we never load the model. Each tag/archetype is an axis.
const tagVectors: TagVector[] = [
  { slug: "robotics", label: "Robotics", domain: "Engineering", vector: [1, 0, 0] },
  { slug: "biology", label: "Biology", domain: "Science", vector: [0, 1, 0] },
  { slug: "music", label: "Music", domain: "Arts", vector: [0, 0, 1] },
];
const archetypeVectors: ArchetypeVector[] = [
  { slug: "builder-maker", label: "Builder/Maker", vector: [1, 0, 0] },
  { slug: "helper", label: "Helper", vector: [0, 1, 0] },
];

// Fake embedder: maps known phrases to axis-aligned vectors; everything else is neutral.
const VECS: Record<string, number[]> = {
  robots: [1, 0, 0],
  cells: [0, 1, 0],
  guitar: [0, 0, 1],
  "hands-on, practical": [1, 0, 0],
};
const embed = async (text: string): Promise<number[]> => VECS[text] ?? [0, 0, 0];

const deps: UserClassifierDeps = { embed, tagVectors, archetypeVectors };

describe("classifyUser orchestration", () => {
  it("assigns interest tags from the embedded interest document", async () => {
    const { student } = await classifyUser({ interestLabels: ["robots"] }, deps);
    expect(student.interestTagSlugs).toContain("robotics");
  });

  it("always keeps explicit picks even with no embeddable text", async () => {
    const { student } = await classifyUser({ explicitTagSlugs: ["music"] }, deps);
    expect(student.interestTagSlugs).toEqual(["music"]);
  });

  it("snaps a niche to the nearest tag", async () => {
    const { student } = await classifyUser({ nicheTexts: ["cells"] }, deps);
    // "cells" -> [0,1,0] snaps to biology, folded into interest tags.
    expect(student.interestTagSlugs).toContain("biology");
    expect(student.customTagRequests).toHaveLength(0);
  });

  it("creates a custom request when a niche matches nothing", async () => {
    const { student } = await classifyUser({ nicheTexts: ["unmatched niche"] }, deps);
    expect(student.customTagRequests.map((r) => r.text)).toContain("unmatched niche");
  });

  it("scrubs resume PII and reports it (§0.3), embedding only cleaned text", async () => {
    const { piiStripped } = await classifyUser(
      { resumeText: "Contact me at a@b.com" },
      deps,
    );
    expect(piiStripped.some((s) => s.kind === "email")).toBe(true);
  });

  it("GUARDRAIL §0.1: the student payload leaks no personality data", async () => {
    const { result, student } = await classifyUser(
      { interestLabels: ["robots"], adjectives: ["hands-on, practical"] },
      deps,
    );
    // Personality was computed (secret) ...
    expect(result.personality.archetypes.length).toBeGreaterThan(0);
    // ... but never appears in the student-facing shape.
    const json = JSON.stringify(student);
    expect(json).not.toContain("personality");
    expect(json).not.toContain("builder-maker");
    expect(Object.keys(student)).toEqual(["interestTagSlugs", "customTagRequests"]);
  });
});
