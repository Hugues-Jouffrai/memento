import { MODELS, STAGE_MODEL } from "@/ai/config";
import { loadPrompt } from "@/ai/prompts";
import { ReviseOutput } from "@/ai/schemas";
import { applyOps, type CardState, type KbState, type Op, type PageState, type ProposedClaim } from "@/domain/kb";
import type { PipelineDeps } from "./ports";

export interface RevisionInput {
  title: string;
  /** The page's claims before the new source, in order. */
  existing: readonly string[];
  /** The new source's accepted claims, in order. */
  incoming: readonly string[];
  /** The page's open questions (prompt revise/v2): the model may report that the new facts answer one. */
  questions?: readonly string[];
}

export interface Finding {
  kind: "revise" | "contradiction";
  /** 0-based indexes into the input lists. */
  existing: number;
  incoming: number;
  /** Corrected fact (revise only). */
  text: string | null;
  reason: string;
}

export interface RevisionResult {
  reasoning: string;
  findings: Finding[];
  /** Findings the checks refused (unknown claim number, revise without text), kept for the shadow log. */
  rejected: { finding: ReviseOutput["findings"][number]; why: string }[];
  /** Open questions the new facts answer: 0-based index into `input.questions`. */
  resolutions: { question: number; reason: string }[];
}

const numbered = (xs: readonly string[]) => xs.map((t, i) => `${i + 1}. ${t}`).join("\n");

/**
 * Asks the model for disagreements between a page's facts and a new source's facts (R-KB-06). Pure advice: nothing is
 * applied. Findings that point at claims that do not exist, or a revision without a corrected text, are refused.
 */
export async function findRevisions(ai: PipelineDeps["ai"], userId: string | null, input: RevisionInput, opts: { model?: string; promptVersion?: string } = {}): Promise<RevisionResult> {
  if (!input.existing.length || !input.incoming.length) return { reasoning: "nothing to compare", findings: [], rejected: [], resolutions: [] };
  const { data } = await ai.run({
    stage: "revise",
    userId,
    vars: { title: input.title, existing: numbered(input.existing), incoming: numbered(input.incoming), questions: numbered(input.questions ?? []) },
    schema: ReviseOutput,
    ...opts,
  });
  const findings: Finding[] = [];
  const rejected: RevisionResult["rejected"] = [];
  const seen = new Set<string>();
  for (const f of data.findings) {
    const why =
      f.existing > input.existing.length || f.new > input.incoming.length
        ? "unknown claim number"
        : f.kind === "revise" && !f.text?.trim()
          ? "revision without corrected text"
          : seen.has(`${f.existing}|${f.new}`)
            ? "repeated pair"
            : null;
    if (why) {
      rejected.push({ finding: f, why });
      continue;
    }
    seen.add(`${f.existing}|${f.new}`);
    findings.push({ kind: f.kind, existing: f.existing - 1, incoming: f.new - 1, text: f.kind === "revise" ? f.text!.trim() : null, reason: f.reason });
  }
  // A question number outside the list, or a repeated one, is ignored.
  const resolutions: RevisionResult["resolutions"] = [];
  for (const r of data.resolves) {
    if (r.question > (input.questions?.length ?? 0) || resolutions.some((x) => x.question === r.question - 1)) continue;
    resolutions.push({ question: r.question - 1, reason: r.reason });
  }
  return { reasoning: data.reasoning, findings, rejected, resolutions };
}

export interface ShadowInput {
  userId: string;
  captureId: string;
  /** The page as it was before this source: its claims are what the new claims are compared with. */
  page: PageState;
  /** The new source's accepted claims. */
  incoming: readonly ProposedClaim[];
}

/**
 * Shadow mode (D44): runs the revise stage and records what a real run would have done, applying nothing. The findings
 * become operations and go through `applyOps` on a copy of the page and its cards, so the log shows the real outcome
 * (claim revised, card update proposed, contradiction flagged). Best effort: any failure is recorded or logged, and the
 * capture goes on.
 */
export async function recordShadowRevisions(deps: PipelineDeps, input: ShadowInput): Promise<void> {
  const { userId, captureId, page, incoming } = input;
  const base = { user_id: userId, capture_id: captureId, page_id: page.id, prompt_version: loadPrompt("revise").version, model: STAGE_MODEL.revise ?? MODELS.smart };
  try {
    if (!page.claims.length || !incoming.length) return;
    const { data: questionRows } = await deps.db.from("open_question").select("id,text").eq("page_id", page.id).eq("status", "open").order("created_at").order("id");
    const questions = (questionRows ?? []) as { id: string; text: string }[];
    const result = await findRevisions(deps.ai, userId, { title: page.title, existing: page.claims.map((c) => c.text), incoming: incoming.map((c) => c.text), questions: questions.map((q) => q.text) });
    const claimIds = page.claims.map((c) => c.id);
    const { data: cardRows } = await deps.db.from("card").select("id,claim_id,status").in("claim_id", claimIds);
    const cards: CardState[] = ((cardRows ?? []) as { id: string; claim_id: string; status: CardState["status"] }[]).map((c) => ({ id: c.id, claimId: c.claim_id, status: c.status }));

    const rejected: unknown[] = result.rejected.map((r) => ({ ...r.finding, why: r.why }));
    const findings: unknown[] = [];
    const wouldDo: unknown[] = [];
    let state: KbState = { pages: { [page.id]: page }, cards };
    for (const f of result.findings) {
      const claim = page.claims[f.existing]!;
      const neu = incoming[f.incoming]!;
      const op: Op =
        f.kind === "revise"
          ? { op: "revise_claim", claim: claim.id, text: f.text!, reason: f.reason }
          : { op: "flag_contradiction", claim: claim.id, new_data: neu.text, reason: f.reason };
      const applied = applyOps(state, [op], { sourceText: "", newPageId: "" });
      if (!applied.ok) {
        rejected.push({ kind: f.kind, existing: f.existing + 1, new: f.incoming + 1, why: applied.errors.join("; ") });
        continue;
      }
      state = applied.state;
      findings.push({ kind: f.kind, claimId: claim.id, existing: claim.text, incoming: neu.text, incomingOrigin: neu.origin, revised: f.text, reason: f.reason });
      wouldDo.push(...applied.events);
    }
    // Resolving a question is advice only while the revise stage is in shadow mode: it is logged, not applied.
    for (const r of result.resolutions) wouldDo.push({ kind: "question_resolved", page: page.id, detail: { question: questions[r.question]!.id, text: questions[r.question]!.text, reason: r.reason } });
    const { error } = await deps.db.from("revision_shadow").upsert({ ...base, reasoning: result.reasoning, findings, rejected, would_do: wouldDo, error: null }, { onConflict: "capture_id" });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("shadow revisions failed:", err);
    try {
      await deps.db.from("revision_shadow").upsert({ ...base, error: err instanceof Error ? err.message.slice(0, 500) : "unknown error" }, { onConflict: "capture_id" });
    } catch {
      // Nothing more to do: the shadow log is advisory.
    }
  }
}
