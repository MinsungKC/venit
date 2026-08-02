import { describe, expect, it } from "vitest";
import { parseOpportunityApplicationPayload } from "../lib/opportunities";

describe("parseOpportunityApplicationPayload", () => {
  it("normalizes and validates a complete application submission", () => {
    const payload = parseOpportunityApplicationPayload({
      slug: "  sample-opportunity  ",
      name: "  Maya Chen  ",
      email: "maya@example.com",
      message: "  I would love to contribute.  ",
    });

    expect(payload).toEqual({
      slug: "sample-opportunity",
      name: "Maya Chen",
      email: "maya@example.com",
      message: "I would love to contribute.",
    });
  });

  it("rejects malformed email addresses", () => {
    expect(() =>
      parseOpportunityApplicationPayload({
        slug: "sample",
        name: "Maya",
        email: "not-an-email",
        message: "Hello",
      }),
    ).toThrow(/email/i);
  });
});
