import { describe, it, expect } from "vitest";
import { parseCsv, parseCsvObjects } from "../lib/csv";

describe("parseCsv", () => {
  it("handles quoted fields containing commas", () => {
    const rows = parseCsv('a,b,c\n1,"x, y",3\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "x, y", "3"],
    ]);
  });
  it("handles escaped quotes", () => {
    const rows = parseCsv('name\n"He said ""hi"""');
    expect(rows[1]).toEqual(['He said "hi"']);
  });
  it("skips blank lines", () => {
    expect(parseCsv("a\n\nb\n")).toEqual([["a"], ["b"]]);
  });
});

describe("parseCsvObjects", () => {
  it("keys rows by header", () => {
    const objs = parseCsvObjects(
      'Symbol,Security,Headquarters Location\nMMM,3M,"Saint Paul, Minnesota"\n',
    );
    expect(objs).toEqual([
      { Symbol: "MMM", Security: "3M", "Headquarters Location": "Saint Paul, Minnesota" },
    ]);
  });
});
