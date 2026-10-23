import { MODELS, STAGE_MODEL } from "@/ai/config";
import { loadPrompt } from "@/ai/prompts";
import { LinkOutput } from "@/ai/schemas";
import { LINK_MODE, selectLinks, type SelectedLink } from "@/domain/page-links";
import { applyOps, NEW_PAGE, type Op } from "@/domain/kb";
import type { PageCandidate } from "@/domain/matching";
import { candidatesText } from "./topics";
import type { PipelineDeps } from "./ports";

export interface LinkSource {
  topic: string;
  summary: string[];
}

export interface LinkResult {
  reasoning: string;
  accepted: SelectedLink[];
  rejected: { link: LinkOutput["links"][number]; why: string }[];
}

/**
 * Asks the model which shortlisted pages are directly related to a source's page (R-KB-12). Pure advice: it returns the
 * links that passed the checks and the ones refused. No candidates means no call.
 */
export async function findLinks(ai: PipelineDeps["ai"], userId: string | null, source: LinkSource, candidates: readonly PageCandidate[], opts: { model?: string; promptVersion?: string; threshold?: number } = {}): Promise<LinkResult> {
  if (!candidates.length) return { reasoning: "no candidate page", accepted: [], rejected: [] };
  const { data } = await ai.run({
    stage: "link",
    userId,
    vars: { topic: source.topic, summary: source.summary.map((s) => `- ${s}`).join("\n"), candidates: candidatesText(candidates) },
    schema: LinkOutput,
    model: opts.model,
    promptVersion: opts.promptVersion,
  });
  return { reasoning: data.reasoning, ...selectLinks(data.links, candidates, opts.threshold) };
}

export interface ProposeLinksInput {
  userId: string;
  captureId: string;
  source: LinkSource;
  /** The match shortlist minus the page the source landed on. */
  candidates: readonly PageCandidate[];
  /** The page the source landed on: an existing page's id, or NEW_PAGE for the page this batch creates. */
  pageRef: string;
  /** Pages already linked (active or removed) to the landed page: not asked about again (R-KB-13). */
  linkedPageIds?: ReadonlySet<string>;
}

/**
 * The link stage of one source (D66). Returns the `link_pages` operations to add to the source's batch: none in shadow
 * mode, where the proposals are only logged in `link_shadow`. Best effort: any failure is logged and the capture goes on.
 */
export async function proposeLinks(deps: PipelineDeps, input: ProposeLinksInput, mode: "shadow" | "live" = LINK_MODE): Promise<Op[]> {
  const { userId, captureId, source, pageRef } = input;
  const candidates = input.candidates.filter((c) => !input.linkedPageIds?.has(c.id));
  const base = { user_id: userId, capture_id: captureId, mode, prompt_version: loadPrompt("link").version, model: STAGE_MODEL.link ?? MODELS.smart, candidates: candidates.map((c) => ({ id: c.id, title: c.title, similarity: Number(c.similarity.toFixed(4)) })) };
  try {
    if (!candidates.length) return [];
    const result = await findLinks(deps.ai, userId, source, candidates);
    // The same checks the database makes, on a copy of the state, so a link that would fail never costs the source.
    const self = pageRef === NEW_PAGE ? "$self" : pageRef;
    const pages = Object.fromEntries([
      [self, { id: self, title: source.topic, summary: source.summary, claims: [] }],
      ...result.accepted.map((l) => [l.page.id, { id: l.page.id, title: l.page.title, summary: l.page.summary, claims: [] }]),
    ]);
    const rejected: unknown[] = result.rejected.map((r) => ({ ...r.link, why: r.why }));
    const kept: SelectedLink[] = [];
    for (const l of result.accepted) {
      const checked = applyOps({ pages, cards: [] }, [{ op: "link_pages", page_a: self, page_b: l.page.id, reason: l.reason }], { sourceText: "", newPageId: "$unused" });
      if (checked.ok) kept.push(l);
      else rejected.push({ candidate: l.page.title, why: checked.errors.join("; ") });
    }
    const accepted = kept.map((l) => ({ page: l.page.id, title: l.page.title, reason: l.reason, confidence: l.confidence }));
    const { error } = await deps.db.from("link_shadow").upsert({ ...base, reasoning: result.reasoning, accepted, rejected, error: null }, { onConflict: "capture_id" });
    if (error) console.error("link_shadow not stored:", error.message);
    if (mode === "shadow") return [];
    return kept.map((l): Op => ({ op: "link_pages", page_a: pageRef, page_b: l.page.id, reason: l.reason }));
  } catch (err) {
    console.error("link stage failed:", err);
    try {
      await deps.db.from("link_shadow").upsert({ ...base, error: err instanceof Error ? err.message.slice(0, 500) : "unknown error" }, { onConflict: "capture_id" });
    } catch {
      /* best effort */
    }
    return [];
  }
}
