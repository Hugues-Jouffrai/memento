import path from "node:path";
import { describe, expect, it } from "vitest";
import { expectedPairs, loadSequence, scoreGrouping } from "./match";

describe("matching eval", () => {
  const seq = loadSequence(path.join(process.cwd(), "eval", "match-fixtures", "sequence.yaml"));

  it("[R-EVAL-01] the sequence has sources in several languages and formats, with clusters that name real sources", () => {
    expect(seq.sources.length).toBeGreaterThanOrEqual(10);
    expect(new Set(seq.sources.map((s) => s.kind))).toEqual(new Set(["rich", "note"]));
    expect(seq.clusters.length).toBeGreaterThanOrEqual(2);
    expect(seq.sources.every((s) => s.text.length > 20)).toBe(true);
  });

  it("[R-EVAL-02] counts pairs expected together only inside a cluster", () => {
    const { same, total } = expectedPairs(["a", "b", "c", "d"], [["a", "b", "c"]]);
    expect(same.size).toBe(3);
    expect(total).toBe(6);
  });

  it("[R-EVAL-02] separates false merges (costly) from missed merges (a duplicate page)", () => {
    const ids = ["a", "b", "c", "d"];
    const perfect = scoreGrouping({ a: "p1", b: "p1", c: "p2", d: "p3" }, ids, [["a", "b"]]);
    expect(perfect).toMatchObject({ falseMerges: [], missedMerges: [], pairs: 6 });
    const bad = scoreGrouping({ a: "p1", b: "p2", c: "p3", d: "p3" }, ids, [["a", "b"]]);
    expect(bad.missedMerges).toEqual(["a + b"]);
    expect(bad.falseMerges).toEqual(["c + d"]);
  });
});
