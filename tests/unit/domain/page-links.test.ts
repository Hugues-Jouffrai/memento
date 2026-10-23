import { describe, expect, it } from "vitest";
import { LINK_CONFIDENCE, MAX_LINKS_PER_SOURCE, selectLinks } from "@/domain/page-links";
import type { PageCandidate } from "@/domain/matching";

const cands: PageCandidate[] = [1, 2, 3, 4, 5].map((n) => ({ id: `p${n}`, title: `Page ${n}`, summary: ["x"], similarity: 0.9 - n / 100 }));
const link = (candidate: number, confidence = 0.9, reason = "Raison courte.") => ({ candidate, reason, confidence });

describe("[R-KB-12] which proposed links are applied", () => {
  it("keeps confident links to listed candidates, most confident first", () => {
    const r = selectLinks([link(2, 0.85), link(1, 0.95)], cands);
    expect(r.accepted.map((l) => l.page.id)).toEqual(["p1", "p2"]);
    expect(r.rejected).toEqual([]);
  });

  it("refuses an unknown candidate number, a low confidence, a repeat and a bad reason, with the reason", () => {
    const r = selectLinks([link(9), link(0), link(1, LINK_CONFIDENCE - 0.01), link(2), link(2, 0.8), link(3, 0.9, ""), link(4, 0.9, "x".repeat(161))], cands);
    expect(r.accepted.map((l) => l.page.id)).toEqual(["p2"]);
    expect(r.rejected.map((x) => x.why).sort()).toEqual(
      ["below the confidence bar", "reason empty or too long", "reason empty or too long", "repeated candidate", "unknown candidate number", "unknown candidate number"].sort(),
    );
  });

  it("applies at most the allowed links per source", () => {
    const r = selectLinks([link(1, 0.99), link(2, 0.98), link(3, 0.97), link(4, 0.96)], cands);
    expect(r.accepted).toHaveLength(MAX_LINKS_PER_SOURCE);
    expect(r.rejected.map((x) => x.why)).toEqual(["more than the allowed links per source"]);
  });

  it("returns nothing for no proposals", () => {
    expect(selectLinks([], cands)).toEqual({ accepted: [], rejected: [] });
  });
});
