/** Pure topic-matching rules (R-KB-02, R-KB-07): shortlist by similarity, apply the model's decision, merge page summaries. */

/** How many candidate pages the model is shown. */
export const SHORTLIST_SIZE = 5;
/** The model's decision is applied only at or above this confidence; below it a new page is created (D41). */
export const MERGE_CONFIDENCE = 0.8;
/** A page summary has at most this many bullets (R-KB-07: 3 to 7). */
export const MAX_SUMMARY_BULLETS = 7;

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface PageCandidate {
  id: string;
  title: string;
  summary: string[];
  similarity: number;
}

/** The pages closest to `query`, most similar first (the database does this with pgvector; evals and tests use this). */
export function shortlist<P extends { id: string; title: string; summary: string[]; embedding: readonly number[] }>(
  query: readonly number[],
  pages: readonly P[],
  k = SHORTLIST_SIZE,
): PageCandidate[] {
  return pages
    .map((p) => ({ id: p.id, title: p.title, summary: p.summary, similarity: cosine(query, p.embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

export interface MatchDecision {
  decision: "update" | "new";
  /** 1-based index into the shortlist. */
  page: number | null;
  confidence: number;
}

/** The page to extend, or null for a new page: only a confident, well-formed "update" counts (a duplicate is cheaper than a false merge). */
export function pageToUpdate(d: MatchDecision, candidates: readonly PageCandidate[], threshold = MERGE_CONFIDENCE): PageCandidate | null {
  if (d.decision !== "update" || d.page === null || d.confidence < threshold) return null;
  return candidates[d.page - 1] ?? null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Summary of an extended page: the page's own bullets first, then the new source's, without repeats, capped. */
export function mergeSummary(existing: readonly string[], added: readonly string[], max = MAX_SUMMARY_BULLETS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const bullet of [...existing, ...added]) {
    const key = norm(bullet);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(bullet);
  }
  return out.slice(0, max);
}

/** The text that represents a page (or a new source) for embedding: title then summary bullets. */
export function embeddingText(title: string, summary: readonly string[]): string {
  return [title, ...summary.map((s) => `- ${s}`)].join("\n");
}
