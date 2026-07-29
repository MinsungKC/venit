import { describe, it, expect } from "vitest";
import { moreLikeThis, type Vectored } from "../lib/similar";

const candidates: Vectored[] = [
  { id: "a", vector: [1, 0, 0] },
  { id: "b", vector: [0.9, 0.1, 0] },
  { id: "c", vector: [0, 1, 0] },
  { id: "d", vector: [0, 0, 1] },
];

describe("moreLikeThis", () => {
  it("ranks candidates by cosine similarity to the target", () => {
    const out = moreLikeThis([1, 0, 0], candidates, { k: 2 });
    expect(out.map((n) => n.item.id)).toEqual(["a", "b"]);
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it("excludes the source listing by id", () => {
    const out = moreLikeThis([1, 0, 0], candidates, { k: 2, excludeId: "a" });
    expect(out.map((n) => n.item.id)).toEqual(["b", "c"]);
  });

  it("caps the result at k", () => {
    expect(moreLikeThis([1, 0, 0], candidates, { k: 1 })).toHaveLength(1);
  });

  it("skips candidates whose vector dimension does not match", () => {
    const mixed: Vectored[] = [...candidates, { id: "bad", vector: [1, 0] }];
    const out = moreLikeThis([1, 0, 0], mixed, { k: 10 });
    expect(out.map((n) => n.item.id)).not.toContain("bad");
  });
});
