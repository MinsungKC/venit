import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guardrail §0.1 — personality is secret. This is a STRUCTURAL guard on the schema: no DB
 * required, so it runs in CI today, before any student-facing endpoint exists. It fails if
 * a future edit grants read access to the personality columns or leaks them through the
 * public view. The full round-trip leakage test against a live endpoint is added when the
 * matching API lands; this keeps the invariant from regressing in the meantime.
 */
const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0003_profiles.sql"),
  "utf8",
).toLowerCase();

const SECRET_COLS = ["personality_vector", "personality_archetypes"];

describe("personality column guard (0003_profiles.sql)", () => {
  it("blanket-revokes profiles from anon/authenticated before granting", () => {
    expect(SQL).toMatch(/revoke all on profiles from anon,\s*authenticated/);
  });

  it("never grants SELECT on a personality column to a non-service role", () => {
    // Scan every `grant select (...) ... to <roles>` and assert no secret column appears.
    const selectGrants = [...SQL.matchAll(/grant\s+select\s*\(([^)]*)\)/g)].map((m) => m[1]);
    for (const cols of selectGrants) {
      for (const secret of SECRET_COLS) {
        expect(cols, `SELECT grant must not include ${secret}`).not.toContain(secret);
      }
    }
  });

  it("the public view excludes every personality column", () => {
    const view = SQL.match(/create or replace view profiles_public[\s\S]*?from profiles;/);
    expect(view, "profiles_public view must exist").not.toBeNull();
    for (const secret of SECRET_COLS) {
      expect(view![0], `profiles_public must not select ${secret}`).not.toContain(secret);
    }
  });

  it("keeps the archetype taxonomy and desired-personality links service-only", () => {
    expect(SQL).toMatch(/revoke all on personality_archetypes\s+from anon,\s*authenticated/);
    expect(SQL).toMatch(/revoke all on listing_desired_personality\s+from anon,\s*authenticated/);
  });
});
