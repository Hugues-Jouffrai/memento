import { MatchOutput } from "@/ai/schemas";
import { MERGE_CONFIDENCE, SHORTLIST_SIZE, embeddingText, pageToUpdate, type PageCandidate } from "@/domain/matching";
import type { PipelineDeps } from "./ports";

/** What the match stage needs to know about the new source (the output of claims extraction or enrichment). */
export interface NewSource {
  topic: string;
  summary: string[];
  claims: { text: string }[];
}

export interface MatchResult {
  /** The page to extend, or null: create a page of its own. */
  page: PageCandidate | null;
  decision: "update" | "new";
  confidence: number;
  reasoning: string;
}

export const candidatesText = (candidates: readonly PageCandidate[]) =>
  candidates.map((c, i) => `${i + 1}. ${c.title}\n${c.summary.map((s) => `   - ${s}`).join("\n")}`).join("\n");

/**
 * Asks the model whether the new source belongs on one of the shortlisted pages (R-KB-02). Only a confident, valid
 * "update" extends a page; everything else is a new page. No candidates means no call.
 */
export async function decideMatch(
  ai: PipelineDeps["ai"],
  userId: string | null,
  source: NewSource,
  candidates: readonly PageCandidate[],
  opts: { model?: string; promptVersion?: string; threshold?: number } = {},
): Promise<MatchResult> {
  if (!candidates.length) return { page: null, decision: "new", confidence: 1, reasoning: "no existing page" };
  const { data } = await ai.run({
    stage: "match",
    userId,
    vars: {
      topic: source.topic,
      summary: source.summary.map((s) => `- ${s}`).join("\n"),
      claims: source.claims.slice(0, 8).map((c) => `- ${c.text}`).join("\n"),
      candidates: candidatesText(candidates),
    },
    schema: MatchOutput,
    model: opts.model,
    promptVersion: opts.promptVersion,
  });
  const page = pageToUpdate(data, candidates, opts.threshold ?? MERGE_CONFIDENCE);
  return { page, decision: page ? "update" : "new", confidence: data.confidence, reasoning: data.reasoning };
}

/** The outcome of matching, before anything is stored. */
export interface PagePlan {
  /** The page the source extends, or null for a new page. */
  page: PageCandidate | null;
  /** Embedding of the source's own topic and summary (becomes the new page's embedding), when it could be computed. */
  vector: number[] | null;
  model: string | null;
  /** The shortlist the model saw (closest pages first), reused by the link stage (D66); empty when matching failed. */
  candidates: PageCandidate[];
}

/**
 * Topic matching for one extracted source (R-KB-02): embed it, shortlist the user's closest pages, let the model decide.
 * Never fails the capture: if anything goes wrong the source simply gets a page of its own.
 */
export async function planPage(deps: PipelineDeps, userId: string, captureId: string, source: NewSource): Promise<PagePlan> {
  try {
    const { vectors, model } = await deps.ai.embed({ stage: "embed", userId, texts: [embeddingText(source.topic, source.summary)] });
    const vector = vectors[0]!;
    const { data, error } = await deps.db.rpc("match_pages", { p_user_id: userId, p_embedding: JSON.stringify(vector), p_model: model, p_limit: SHORTLIST_SIZE });
    if (error) throw new Error(`match_pages: ${error.message}`);
    const candidates = ((data ?? []) as { id: string; title: string; summary: string[]; similarity: number }[]).map((r) => ({ id: r.id, title: r.title, summary: r.summary, similarity: r.similarity }));
    const match = await decideMatch(deps.ai, userId, source, candidates);
    await deps.db.from("match_log").insert({
      user_id: userId,
      capture_id: captureId,
      decision: match.decision,
      page_id: match.page?.id ?? null,
      confidence: match.confidence,
      reasoning: match.reasoning,
      candidates: candidates.map((c) => ({ id: c.id, title: c.title, similarity: Number(c.similarity.toFixed(4)) })),
    });
    return { page: match.page, vector, model, candidates };
  } catch (err) {
    console.error("topic matching failed, the source gets a page of its own:", err);
    return { page: null, vector: null, model: null, candidates: [] };
  }
}

/** Stores a page's embedding (best effort: a page without one is only invisible to matching until it is next extended). */
export async function storePageEmbedding(deps: PipelineDeps, userId: string, pageId: string, vector: number[] | null, model: string | null, title: string, summary: string[]): Promise<void> {
  try {
    let v = vector;
    let m = model;
    if (!v || !m) {
      const out = await deps.ai.embed({ stage: "embed", userId, texts: [embeddingText(title, summary)] });
      v = out.vectors[0]!;
      m = out.model;
    }
    const { error } = await deps.db.from("page").update({ embedding: JSON.stringify(v), embedding_model: m }).eq("id", pageId);
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("page embedding not stored:", err);
  }
}
