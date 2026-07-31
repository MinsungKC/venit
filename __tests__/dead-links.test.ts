import { describe, it, expect } from "vitest";
import { isDeadStatus, urlKey } from "../lib/dead-links";

describe("isDeadStatus", () => {
  it("flags 404, 410, and 5xx as dead", () => {
    expect(isDeadStatus(404)).toBe(true);
    expect(isDeadStatus(410)).toBe(true);
    expect(isDeadStatus(500)).toBe(true);
    expect(isDeadStatus(503)).toBe(true);
  });

  it("does NOT flag auth/bot walls, method-restrictions, rate limits, or success", () => {
    for (const s of [200, 204, 301, 302, 401, 403, 405, 429]) {
      expect(isDeadStatus(s)).toBe(false);
    }
  });
});

describe("urlKey", () => {
  it("normalizes host + path (lowercased, no trailing slash) for de-duping", () => {
    expect(urlKey("https://Example.com/Jobs/")).toBe("example.com/jobs");
    expect(urlKey("https://example.com/jobs")).toBe("example.com/jobs");
  });

  it("treats bare host with and without trailing slash the same", () => {
    expect(urlKey("https://example.com")).toBe(urlKey("https://example.com/"));
  });

  it("is null for missing or unparseable URLs", () => {
    expect(urlKey(null)).toBeNull();
    expect(urlKey("not a url")).toBeNull();
  });
});
