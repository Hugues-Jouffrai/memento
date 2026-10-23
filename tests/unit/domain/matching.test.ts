import { describe, expect, it } from "vitest";
import { MERGE_CONFIDENCE, cosine, embeddingText, mergeSummary, pageToUpdate, shortlist, type PageCandidate } from "@/domain/matching";

const page = (id: string, embedding: number[], title = id) => ({ id, title, summary: [`about ${title}`], embedding });
const cands: PageCandidate[] = [
  { id: "p1", title: "FSRS", summary: [], similarity: 0.7 },
  { id: "p2", title: "Warhol", summary: [], similarity: 0.5 },
];

describe("[R-KB-02] topic matching rules", () => {
  it("cosine is 1 for the same direction, 0 for orthogonal vectors and safe on zero vectors", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it("shortlist returns the closest pages first and at most k", () => {
    const pages = [page("a", [1, 0]), page("b", [0.9, 0.1]), page("c", [0, 1]), page("d", [-1, 0])];
    expect(shortlist([1, 0], pages, 2).map((p) => p.id)).toEqual(["a", "b"]);
    expect(shortlist([1, 0], [], 5)).toEqual([]);
  });

  it("a confident update picks the numbered candidate", () => {
    expect(pageToUpdate({ decision: "update", page: 1, confidence: 0.95 }, cands)?.id).toBe("p1");
    expect(pageToUpdate({ decision: "update", page: 2, confidence: MERGE_CONFIDENCE }, cands)?.id).toBe("p2");
  });

  it("a duplicate is cheaper than a false merge: low confidence, 'new', a missing or out-of-range number all give a new page", () => {
    expect(pageToUpdate({ decision: "update", page: 1, confidence: 0.79 }, cands)).toBeNull();
    expect(pageToUpdate({ decision: "new", page: null, confidence: 0.99 }, cands)).toBeNull();
    expect(pageToUpdate({ decision: "update", page: null, confidence: 0.99 }, cands)).toBeNull();
    expect(pageToUpdate({ decision: "update", page: 3, confidence: 0.99 }, cands)).toBeNull();
    expect(pageToUpdate({ decision: "update", page: 0, confidence: 0.99 }, cands)).toBeNull();
  });
});

describe("[R-KB-07] page summaries and claims when a page is extended", () => {
  it("keeps the page's own bullets first, drops repeats (case and spacing) and caps at 7", () => {
    const merged = mergeSummary(["A", "B"], ["b ", "C", "D", "E", "F", "G", "H"]);
    expect(merged).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });

  it("the embedded text is the title then the summary bullets", () => {
    expect(embeddingText("FSRS", ["a", "b"])).toBe("FSRS\n- a\n- b");
  });
});
