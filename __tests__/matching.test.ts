import { describe, it, expect } from "vitest";
import {
  boostPreferredKinds,
  costRank,
  coverageScore,
  distanceKm,
  diversifyByFacet,
  fitLabel,
  focusScore,
  haversineKm,
  match,
  passesHardFilters,
  relevanceScore,
  tagOverlapScore,
} from "../lib/matching";
import type { MatchListing, MatchProfile } from "../lib/match-types";

/**
 * Fixtures. Personality vectors are small synthetic 4-dim unit vectors (cosine assumes L2
 * normalization) so fit scores are exact and readable:
 *   [1,0,0,0] · [1,0,0,0]        = 1.00 → "Great fit"
 *   [1,0,0,0] · [0.8,0.6,0,0]    = 0.80 → "Great fit"
 *   [1,0,0,0] · [0.5,0.8660254,0,0] = 0.50 → "Good fit"
 *   [1,0,0,0] · [0,1,0,0]        = 0.00 → "Fair fit"
 */
const V_SAME = [1, 0, 0, 0];
const V_080 = [0.8, 0.6, 0, 0];
const V_050 = [0.5, 0.8660254, 0, 0];
const V_000 = [0, 1, 0, 0];

/** A student at (40, -74) interested in ai/biology/robotics. */
function mkProfile(over: Partial<MatchProfile> = {}): MatchProfile {
  return {
    age: 16,
    grade: 11,
    lat: 40,
    lng: -74,
    interestTagSlugs: ["ai", "biology", "robotics"],
    personalityVector: V_SAME,
    ...over,
  };
}

/** An approved company sharing the "ai" tag, with everything else permissive by default. */
function mkListing(over: Partial<MatchListing> = {}): MatchListing {
  return {
    id: "base",
    kind: "company",
    status: "approved",
    tagSlugs: ["ai"],
    ageMin: null,
    ageMax: null,
    gradeMin: null,
    gradeMax: null,
    lat: null,
    lng: null,
    isRemote: false,
    costType: "free",
    costAmount: null,
    radiusKm: null,
    desiredPersonalityVector: null,
    ...over,
  };
}

describe("haversineKm", () => {
  it("is ~0 for identical points", () => {
    expect(haversineKm(40, -74, 40, -74)).toBeCloseTo(0, 6);
  });
  it("is ~111 km per degree of latitude", () => {
    expect(haversineKm(40, -74, 41, -74)).toBeCloseTo(111.2, 0);
  });
});

describe("passesHardFilters", () => {
  it("allows a fully permissive, approved, tag-sharing listing", () => {
    expect(passesHardFilters(mkProfile(), mkListing())).toBe(true);
  });

  it("excludes a listing that shares no interest tag (§0.4)", () => {
    expect(passesHardFilters(mkProfile(), mkListing({ tagSlugs: ["chemistry"] }))).toBe(false);
  });

  it("excludes a pending listing", () => {
    expect(passesHardFilters(mkProfile(), mkListing({ status: "pending" }))).toBe(false);
  });

  it("excludes a rejected listing", () => {
    expect(passesHardFilters(mkProfile(), mkListing({ status: "rejected" }))).toBe(false);
  });

  it("excludes when the student is below the age minimum (§0.6)", () => {
    expect(passesHardFilters(mkProfile({ age: 16 }), mkListing({ ageMin: 18 }))).toBe(false);
  });

  it("excludes when the student is above the age maximum (§0.6)", () => {
    expect(passesHardFilters(mkProfile({ age: 16 }), mkListing({ ageMax: 15 }))).toBe(false);
  });

  it("excludes when the student is outside the grade range (§0.6)", () => {
    expect(passesHardFilters(mkProfile({ grade: 11 }), mkListing({ gradeMin: 12 }))).toBe(false);
  });

  it("keeps a listing whose age bound is set but the student's age is unknown", () => {
    expect(passesHardFilters(mkProfile({ age: null }), mkListing({ ageMin: 18 }))).toBe(true);
  });

  it("keeps a listing with missing (null) optional age/grade bounds", () => {
    expect(
      passesHardFilters(mkProfile(), mkListing({ ageMin: null, ageMax: null, gradeMin: null })),
    ).toBe(true);
  });

  it("excludes an in-person research_lab outside its radius (§0.5)", () => {
    const lab = mkListing({ kind: "research_lab", lat: 0, lng: 0, isRemote: false, radiusKm: 80 });
    expect(passesHardFilters(mkProfile(), lab)).toBe(false);
  });

  it("keeps an in-person research_lab within its radius (§0.5)", () => {
    const lab = mkListing({ kind: "research_lab", lat: 40.1, lng: -74.1, isRemote: false });
    expect(passesHardFilters(mkProfile(), lab)).toBe(true);
  });

  it("keeps a remote research_lab even with no coordinates (§0.5)", () => {
    const lab = mkListing({ kind: "research_lab", isRemote: true, lat: null, lng: null });
    expect(passesHardFilters(mkProfile(), lab)).toBe(true);
  });

  it("excludes an in-person research_lab when coordinates are unknown (§0.5)", () => {
    const lab = mkListing({ kind: "research_lab", isRemote: false, lat: null, lng: null });
    expect(passesHardFilters(mkProfile(), lab)).toBe(false);
  });

  it("does not filter a company just for not recruiting (still tag-matchable, §0.4)", () => {
    // No "recruiting" gate exists; an approved, tag-sharing company always passes.
    expect(passesHardFilters(mkProfile(), mkListing({ costType: "unknown" }))).toBe(true);
  });
});

describe("fitLabel", () => {
  it("buckets an exact match as Great fit", () => {
    expect(fitLabel(mkProfile(), mkListing({ desiredPersonalityVector: V_SAME }))).toBe("Great fit");
  });
  it("buckets a mid-similarity vector as Good fit", () => {
    expect(fitLabel(mkProfile(), mkListing({ desiredPersonalityVector: V_050 }))).toBe("Good fit");
  });
  it("buckets an orthogonal vector as Fair fit", () => {
    expect(fitLabel(mkProfile(), mkListing({ desiredPersonalityVector: V_000 }))).toBe("Fair fit");
  });
  it("is null when either personality vector is missing", () => {
    expect(fitLabel(mkProfile(), mkListing({ desiredPersonalityVector: null }))).toBeNull();
    expect(
      fitLabel(mkProfile({ personalityVector: null }), mkListing({ desiredPersonalityVector: V_SAME })),
    ).toBeNull();
  });
});

describe("distanceKm", () => {
  it("is null for a remote listing (rendered as Remote)", () => {
    expect(distanceKm(mkProfile(), mkListing({ isRemote: true }))).toBeNull();
  });
  it("is null when coordinates are unknown", () => {
    expect(distanceKm(mkProfile(), mkListing({ lat: null, lng: null }))).toBeNull();
  });
  it("is the great-circle distance when both have coordinates", () => {
    expect(distanceKm(mkProfile(), mkListing({ lat: 41, lng: -74 }))).toBeCloseTo(111.2, 0);
  });
});

describe("costRank", () => {
  it("orders free < stipend < paid < unknown", () => {
    expect(costRank(mkListing({ costType: "free" }))).toBeLessThan(
      costRank(mkListing({ costType: "stipend", costAmount: 100 })),
    );
    expect(costRank(mkListing({ costType: "stipend", costAmount: 100 }))).toBeLessThan(
      costRank(mkListing({ costType: "paid", costAmount: 100 })),
    );
    expect(costRank(mkListing({ costType: "paid", costAmount: 100 }))).toBeLessThan(
      costRank(mkListing({ costType: "unknown" })),
    );
  });
  it("orders by amount within a cost type, unknown amount last", () => {
    expect(costRank(mkListing({ costType: "stipend", costAmount: 100 }))).toBeLessThan(
      costRank(mkListing({ costType: "stipend", costAmount: 500 })),
    );
    expect(costRank(mkListing({ costType: "paid", costAmount: 500 }))).toBeLessThan(
      costRank(mkListing({ costType: "paid", costAmount: null })),
    );
  });
});

describe("tagOverlapScore", () => {
  const profile = mkProfile({ interestTagSlugs: ["ai", "biology", "robotics"] });

  it("is 0 when nothing overlaps", () => {
    const docFreq = new Map([["history", 3]]);
    expect(tagOverlapScore(profile, mkListing({ tagSlugs: ["history"] }), docFreq, 3)).toBe(0);
  });

  it("grows with the number of shared tags", () => {
    const docFreq = new Map([
      ["ai", 5],
      ["biology", 5],
      ["history", 5],
    ]);
    const one = tagOverlapScore(profile, mkListing({ tagSlugs: ["ai", "history"] }), docFreq, 10);
    const two = tagOverlapScore(
      profile,
      mkListing({ tagSlugs: ["ai", "biology", "history"] }),
      docFreq,
      10,
    );
    expect(two).toBeGreaterThan(one);
  });

  it("weights a rarer shared tag higher than a common one (equal overlap count)", () => {
    const docFreq = new Map([
      ["ai", 500], // on nearly every listing
      ["robotics", 5], // niche
    ]);
    const common = tagOverlapScore(profile, mkListing({ tagSlugs: ["ai"] }), docFreq, 1000);
    const rare = tagOverlapScore(profile, mkListing({ tagSlugs: ["robotics"] }), docFreq, 1000);
    expect(rare).toBeGreaterThan(common);
  });

  it("only counts each shared tag once, ignoring duplicates in a listing's tagSlugs", () => {
    const docFreq = new Map([["ai", 5]]);
    const deduped = tagOverlapScore(profile, mkListing({ tagSlugs: ["ai"] }), docFreq, 10);
    const withDupe = tagOverlapScore(
      profile,
      mkListing({ tagSlugs: ["ai", "ai"] }),
      docFreq,
      10,
    );
    expect(withDupe).toBe(deduped);
  });

  it("scales a shared tag's contribution by its engagement weight (default 1 = unchanged)", () => {
    const docFreq = new Map([["ai", 5]]);
    const listing = mkListing({ tagSlugs: ["ai"] });
    const neutral = tagOverlapScore(profile, listing, docFreq, 10);
    const weighted = tagOverlapScore(
      mkProfile({ interestTagSlugs: ["ai", "biology", "robotics"], tagWeights: { ai: 3 } }),
      listing,
      docFreq,
      10,
    );
    expect(weighted).toBeCloseTo(neutral * 3);
  });

  it("ranks a listing on a high-affinity interest above one on a neutral interest (equal rarity)", () => {
    const docFreq = new Map([
      ["ai", 5],
      ["biology", 5],
    ]);
    const engaged = mkProfile({
      interestTagSlugs: ["ai", "biology"],
      tagWeights: { ai: 3 }, // student engages with AI far more than biology
    });
    const aiListing = tagOverlapScore(engaged, mkListing({ tagSlugs: ["ai"] }), docFreq, 10);
    const bioListing = tagOverlapScore(engaged, mkListing({ tagSlugs: ["biology"] }), docFreq, 10);
    expect(aiListing).toBeGreaterThan(bioListing);
  });
});

describe("coverageScore", () => {
  const profile = mkProfile({ interestTagSlugs: ["ai", "biology", "robotics"] });

  it("is the fraction of the student's distinct interests the listing covers", () => {
    expect(coverageScore(profile, mkListing({ tagSlugs: ["ai"] }))).toBeCloseTo(1 / 3, 6);
    expect(coverageScore(profile, mkListing({ tagSlugs: ["ai", "biology"] }))).toBeCloseTo(2 / 3, 6);
  });

  it("ignores listing tags the student didn't pick and de-dupes", () => {
    expect(
      coverageScore(profile, mkListing({ tagSlugs: ["ai", "ai", "history", "art"] })),
    ).toBeCloseTo(1 / 3, 6);
  });

  it("is 0 when the student picked nothing", () => {
    expect(coverageScore(mkProfile({ interestTagSlugs: [] }), mkListing())).toBe(0);
  });
});

describe("focusScore", () => {
  const profile = mkProfile({ interestTagSlugs: ["ai", "biology", "robotics"] });

  it("is high for a listing focused on the student's interests", () => {
    expect(focusScore(profile, mkListing({ tagSlugs: ["ai", "biology"] }))).toBe(1); // 2 shared / 2 total
  });

  it("is low for a tag-spam listing that merely happens to include a shared tag", () => {
    const spam = mkListing({ tagSlugs: ["ai", "a", "b", "c", "d", "e", "f", "g", "h", "i"] });
    expect(focusScore(profile, spam)).toBeCloseTo(0.1, 6); // 1 shared / 10 total
  });
});

describe("relevanceScore", () => {
  const profile = mkProfile({ interestTagSlugs: ["ai", "biology", "robotics"] });

  it("ranks a focused listing above a tag-spam one with the SAME single shared tag", () => {
    // Both share only "ai"; equal overlap/coverage, but the spam listing dilutes its focus.
    const docFreq = new Map([["ai", 2]]);
    const focused = relevanceScore(profile, mkListing({ tagSlugs: ["ai"] }), docFreq, 100);
    const spam = relevanceScore(
      profile,
      mkListing({ tagSlugs: ["ai", "x1", "x2", "x3", "x4"] }),
      docFreq,
      100,
    );
    expect(focused).toBeGreaterThan(spam);
  });

  it("ranks a broader-coverage listing above a one-note one at equal overlap mass", () => {
    // Two tags of df=2 vs one tag of df=1: near-equal IDF mass, but broader coverage wins.
    const docFreq = new Map([
      ["ai", 2],
      ["biology", 2],
      ["robotics", 1],
    ]);
    const broad = relevanceScore(profile, mkListing({ tagSlugs: ["ai", "biology"] }), docFreq, 100);
    const narrow = relevanceScore(profile, mkListing({ tagSlugs: ["robotics"] }), docFreq, 100);
    expect(broad).toBeGreaterThan(narrow);
  });

  it("gives actively-recruiting listings a nudge over otherwise-identical ones", () => {
    const docFreq = new Map([["ai", 2]]);
    const recruiting = relevanceScore(
      profile,
      mkListing({ tagSlugs: ["ai"], isRecruiting: true }),
      docFreq,
      100,
    );
    const not = relevanceScore(profile, mkListing({ tagSlugs: ["ai"] }), docFreq, 100);
    expect(recruiting).toBeGreaterThan(not);
  });

  it("lifts an HS-accessible opportunity above the adult pile at equal tag relevance", () => {
    const docFreq = new Map([["ai", 500]]); // "ai" is common, so overlap alone is small
    const hsProgram = relevanceScore(
      profile,
      mkListing({ tagSlugs: ["ai"], hsAccessible: true }),
      docFreq,
      1000,
    );
    const adultCompany = relevanceScore(profile, mkListing({ tagSlugs: ["ai"] }), docFreq, 1000);
    expect(hsProgram).toBeGreaterThan(adultCompany);
  });

  it("HS boost can outrank a modestly deeper adult match (surfacing teen opportunities)", () => {
    // Adult company shares two common tags; HS program shares one — the boost still lifts it.
    const docFreq = new Map([["ai", 400], ["biology", 400]]);
    const hsProgram = relevanceScore(
      profile,
      mkListing({ tagSlugs: ["ai"], hsAccessible: true }),
      docFreq,
      1000,
    );
    const adultCompany = relevanceScore(
      profile,
      mkListing({ tagSlugs: ["ai", "biology"] }),
      docFreq,
      1000,
    );
    expect(hsProgram).toBeGreaterThan(adultCompany);
  });

  it("is 0 when nothing overlaps", () => {
    const docFreq = new Map([["history", 2]]);
    expect(relevanceScore(profile, mkListing({ tagSlugs: ["history"] }), docFreq, 100)).toBe(0);
  });
});

describe("diversifyByFacet", () => {
  const mk = (id: string, f: string) => ({ id, f });
  const facet = (x: { f: string }) => x.f;

  it("breaks up a long run of same-facet items using later different-facet ones", () => {
    // maxRun 2: after two "a"s, the next "a" is deferred in favor of the nearest non-"a".
    const items = [mk("a1", "a"), mk("a2", "a"), mk("a3", "a"), mk("b1", "b")];
    const out = diversifyByFacet(items, facet, { maxRun: 2, lookahead: 8 });
    expect(out.map((i) => i.id)).toEqual(["a1", "a2", "b1", "a3"]);
  });

  it("is a no-op when everything shares one facet (nothing to interleave with)", () => {
    const items = [mk("a1", "a"), mk("a2", "a"), mk("a3", "a")];
    expect(diversifyByFacet(items, facet).map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
  });

  it("never intervenes with a lookahead of 1 (bounded movement → pure pass-through)", () => {
    const items = [mk("a1", "a"), mk("a2", "a"), mk("a3", "a"), mk("b1", "b")];
    const out = diversifyByFacet(items, facet, { maxRun: 2, lookahead: 1 });
    expect(out.map((i) => i.id)).toEqual(["a1", "a2", "a3", "b1"]);
  });

  it("does not mutate the input array", () => {
    const items = [mk("a1", "a"), mk("a2", "a"), mk("a3", "a"), mk("b1", "b")];
    const copy = [...items];
    diversifyByFacet(items, facet, { maxRun: 2 });
    expect(items).toEqual(copy);
  });
});

describe("boostPreferredKinds", () => {
  const items = [
    { kind: "camp" as const, id: "c1" },
    { kind: "company" as const, id: "co1" },
    { kind: "research_lab" as const, id: "r1" },
    { kind: "camp" as const, id: "c2" },
    { kind: "opportunity" as const, id: "o1" },
  ];

  it("is a no-op when no kinds are preferred (order fully preserved)", () => {
    expect(boostPreferredKinds(items, [])).toEqual(items);
  });

  it("moves every preferred-kind item ahead of non-preferred ones", () => {
    const out = boostPreferredKinds(items, ["research_lab", "opportunity"]);
    expect(out.map((i) => i.kind)).toEqual(["research_lab", "opportunity", "camp", "company", "camp"]);
  });

  it("is a STABLE sort: relative order within the preferred group and within the rest is kept", () => {
    const out = boostPreferredKinds(items, ["camp"]);
    // Both camps ("c1","c2") keep their original relative order and lead; the rest keep theirs.
    expect(out.map((i) => i.id)).toEqual(["c1", "c2", "co1", "r1", "o1"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...items];
    boostPreferredKinds(items, ["camp"]);
    expect(items).toEqual(copy);
  });

  it("a kind with no matching items is harmless", () => {
    expect(boostPreferredKinds(items, ["program"])).toEqual(items);
  });
});

describe("match — tag overlap drives the default blend ahead of personality fit", () => {
  it("a weaker-fit listing with more/rarer shared tags outranks a perfect-fit listing with only one broad shared tag", () => {
    const profile = mkProfile({ interestTagSlugs: ["ai", "biology", "robotics"] });
    const listings: MatchListing[] = [
      // Perfect personality fit, but shares only the single most common tag in the pool.
      mkListing({ id: "fit-shallow", tagSlugs: ["ai"], desiredPersonalityVector: V_SAME }),
      // No personality vector at all, but shares two rarer tags.
      mkListing({
        id: "tags-deep",
        tagSlugs: ["biology", "robotics"],
        desiredPersonalityVector: null,
      }),
      // Padding so "ai" is clearly the most common tag in the candidate pool.
      mkListing({ id: "pad-1", tagSlugs: ["ai"] }),
      mkListing({ id: "pad-2", tagSlugs: ["ai"] }),
    ];
    const ids = match(profile, listings).map((r) => r.id);
    expect(ids[0]).toBe("tags-deep");
    expect(ids).toContain("fit-shallow");
  });

  it("falls through to fit as a tiebreaker when tag overlap is equal", () => {
    const profile = mkProfile();
    const listings: MatchListing[] = [
      mkListing({ id: "low-fit", tagSlugs: ["ai"], desiredPersonalityVector: V_000 }),
      mkListing({ id: "high-fit", tagSlugs: ["ai"], desiredPersonalityVector: V_SAME }),
    ];
    const ids = match(profile, listings).map((r) => r.id);
    expect(ids).toEqual(["high-fit", "low-fit"]);
  });

  it("sort:'fit' still uses fit as primary, tag overlap only as its tiebreaker", () => {
    const profile = mkProfile({ interestTagSlugs: ["ai", "biology", "robotics"] });
    const listings: MatchListing[] = [
      mkListing({ id: "great-fit-1tag", tagSlugs: ["ai"], desiredPersonalityVector: V_SAME }),
      mkListing({
        id: "fair-fit-3tags",
        tagSlugs: ["ai", "biology", "robotics"],
        desiredPersonalityVector: V_000,
      }),
    ];
    const ids = match(profile, listings, { sort: "fit" }).map((r) => r.id);
    expect(ids).toEqual(["great-fit-1tag", "fair-fit-3tags"]);
  });
});

describe("match — sort axes", () => {
  it("sort:'fit' orders by fit descending, missing fit last", () => {
    const listings = [
      mkListing({ id: "f-none", desiredPersonalityVector: null }),
      mkListing({ id: "f-fair", desiredPersonalityVector: V_000 }),
      mkListing({ id: "f-great", desiredPersonalityVector: V_SAME }),
      mkListing({ id: "f-good", desiredPersonalityVector: V_050 }),
    ];
    const ids = match(mkProfile(), listings, { sort: "fit" }).map((r) => r.id);
    expect(ids).toEqual(["f-great", "f-good", "f-fair", "f-none"]);
  });

  it("sort:'distance' orders nearest first, remote nearest, unknown last", () => {
    const listings = [
      mkListing({ id: "d-far", lat: 42, lng: -74 }),
      mkListing({ id: "d-unknown", lat: null, lng: null }),
      mkListing({ id: "d-remote", isRemote: true }),
      mkListing({ id: "d-near", lat: 40.1, lng: -74 }),
    ];
    const ids = match(mkProfile(), listings, { sort: "distance" }).map((r) => r.id);
    expect(ids).toEqual(["d-remote", "d-near", "d-far", "d-unknown"]);
  });

  it("sort:'cost' orders cheapest first", () => {
    const listings = [
      mkListing({ id: "c-paid-unknown", costType: "paid", costAmount: null }),
      mkListing({ id: "c-stipend-1000", costType: "stipend", costAmount: 1000 }),
      mkListing({ id: "c-free", costType: "free" }),
      mkListing({ id: "c-paid-100", costType: "paid", costAmount: 100 }),
      mkListing({ id: "c-stipend-500", costType: "stipend", costAmount: 500 }),
    ];
    const ids = match(mkProfile(), listings, { sort: "cost" }).map((r) => r.id);
    expect(ids).toEqual([
      "c-free",
      "c-stipend-500",
      "c-stipend-1000",
      "c-paid-100",
      "c-paid-unknown",
    ]);
  });
});

describe("match — golden default (blend) ordering", () => {
  // Fixed student + 5 listings, all passing the hard filters and all sharing exactly the single
  // tag "ai" (so tag overlap/coverage/focus are equal) — this isolates the personality-fit term
  // of the composite relevance. A(1.0) > {B,C}(0.8) > D(0.5) > E(none). Distance/cost are NOT part
  // of the default blend, so the 0.8 tie between B and C falls through to the id tiebreak (B<C).
  const profile = mkProfile();
  const listings: MatchListing[] = [
    mkListing({ id: "E", desiredPersonalityVector: null, lat: 40, lng: -74 }),
    mkListing({ id: "B", desiredPersonalityVector: V_080, lat: 42, lng: -74, costType: "paid", costAmount: 500 }),
    mkListing({ id: "A", desiredPersonalityVector: V_SAME, lat: 40, lng: -74 }),
    mkListing({ id: "D", desiredPersonalityVector: V_050, lat: 40, lng: -74 }),
    mkListing({ id: "C", desiredPersonalityVector: V_080, lat: 40, lng: -74 }),
  ];

  it("produces the exact expected id order", () => {
    const ids = match(profile, listings).map((r) => r.id);
    expect(ids).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("projects each survivor to a student-safe MatchResult (matched tags + coarse label)", () => {
    const results = match(profile, listings);
    const a = results.find((r) => r.id === "A")!;
    expect(a.matchedTagSlugs).toEqual(["ai"]);
    expect(a.fitLabel).toBe("Great fit");
    expect(a.distanceKm).toBeCloseTo(0, 6);
    const e = results.find((r) => r.id === "E")!;
    expect(e.fitLabel).toBeNull(); // no personality vector → no fit label, still returned
  });
});

describe("match — leakage guard (§0.1)", () => {
  it("emits no personality vector values and no archetype names, only coarse fit labels", () => {
    // Distinctive marker values: if any leak into the output, the substring check catches it.
    const SECRET_MARKER = 0.7654321;
    const profile = mkProfile({ personalityVector: [SECRET_MARKER, 0.1234567, 0, 0] });
    const listings = [
      mkListing({ id: "x", desiredPersonalityVector: [SECRET_MARKER, 0.1234567, 0, 0] }),
      mkListing({ id: "y", desiredPersonalityVector: V_050 }),
    ];
    const json = JSON.stringify(match(profile, listings));

    // No raw vector values.
    expect(json).not.toContain("7654321");
    expect(json).not.toContain("1234567");
    expect(json).not.toContain("8660254");
    // No secret field names or archetype/personality vocabulary.
    expect(json).not.toContain("personalityVector");
    expect(json).not.toContain("desiredPersonalityVector");
    expect(json.toLowerCase()).not.toContain("archetype");
    expect(json.toLowerCase()).not.toContain("personality");
    // Only the coarse, student-safe labels are allowed to appear.
    expect(json).toContain("fitLabel");
    expect(json).toContain("Good fit");
  });
});
