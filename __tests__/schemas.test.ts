import { describe, it, expect } from "vitest";
import { registrationSchema, reportSchema } from "../lib/schemas";

describe("registrationSchema", () => {
  const valid = {
    title: "Robotics Summer Lab",
    kind: "program",
    short_description: "A hands-on program for high schoolers building robots.",
    is_remote: false,
    cost_type: "free",
    tag_slugs: ["robotics"],
  };

  it("accepts a valid submission", () => {
    expect(registrationSchema.safeParse(valid).success).toBe(true);
  });

  it("requires at least one interest tag (guardrail §4)", () => {
    expect(registrationSchema.safeParse({ ...valid, tag_slugs: [] }).success).toBe(false);
  });

  it("rejects an invalid kind", () => {
    expect(registrationSchema.safeParse({ ...valid, kind: "wormhole" }).success).toBe(false);
  });

  it("rejects a too-short description", () => {
    expect(registrationSchema.safeParse({ ...valid, short_description: "hi" }).success).toBe(false);
  });

  it("does NOT accept a personality field from a student (§0.1)", () => {
    const parsed = registrationSchema.parse({ ...valid, personality_vector: [1, 2, 3] } as never);
    expect("personality_vector" in parsed).toBe(false);
  });
});

describe("reportSchema", () => {
  it("accepts a known reason", () => {
    expect(reportSchema.safeParse({ slug: "x", reason: "broken_link" }).success).toBe(true);
  });
  it("rejects an unknown reason", () => {
    expect(reportSchema.safeParse({ slug: "x", reason: "nonsense" }).success).toBe(false);
  });
});
