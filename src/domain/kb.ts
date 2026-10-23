/**
 * Structured knowledge-base updates (R-KB-03, R-KB-05, R-KB-07): the model proposes operations, never rewritten pages.
 * `applyOps` is pure and all-or-nothing: it validates a batch against the current state and returns the new state and
 * the events to log, or the reasons it refused. The database applies the same validated batch in one transaction
 * (`apply_ops`). Operations never touch a card: cards are anchored to claims and only the learning code changes them.
 */
import { z } from "zod";
import { isGrounded } from "./excerpt";
import { MAX_SUMMARY_BULLETS } from "./matching";

/** A claim is one fact: a sentence or two. */
export const MAX_CLAIM_CHARS = 600;
/** Hard size limit of a page (R-KB-07); above it a split is needed (proposed in M3 step 4). */
export const MAX_CLAIMS_PER_PAGE = 60;
/** Open questions a page shows at once (R-KB-14, D66). */
export const MAX_OPEN_QUESTIONS = 3;
export const MAX_QUESTION_CHARS = 200;
export const MAX_LINK_REASON_CHARS = 160;
/** The page a batch creates, referred to by later operations of the same batch. */
export const NEW_PAGE = "$new";

const PageRef = z.string().min(1);
const Text = z.string().trim().min(1);

export const Op = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("create_page"), title: Text.max(120), language: z.string().regex(/^[a-z]{2}$/), summary: z.array(Text).min(1).max(MAX_SUMMARY_BULLETS) }),
  z.strictObject({ op: z.literal("add_claim"), page: PageRef, text: Text.max(MAX_CLAIM_CHARS), origin: z.enum(["source", "model"]), excerpt: Text.max(600).optional() }),
  z.strictObject({ op: z.literal("set_summary"), page: PageRef, summary: z.array(Text).min(1).max(MAX_SUMMARY_BULLETS) }),
  // Step 3 (R-KB-06). `claim` is a claim id. Shadow mode: only the dry run uses these, the database still refuses them.
  z.strictObject({ op: z.literal("revise_claim"), claim: PageRef, text: Text.max(MAX_CLAIM_CHARS), reason: Text.max(400) }),
  z.strictObject({ op: z.literal("flag_contradiction"), claim: PageRef, new_data: Text.max(MAX_CLAIM_CHARS), reason: Text.max(400) }),
  // M3 step 4 (R-KB-12 to R-KB-14, D66).
  z.strictObject({ op: z.literal("link_pages"), page_a: PageRef, page_b: PageRef, reason: Text.max(MAX_LINK_REASON_CHARS) }),
  z.strictObject({ op: z.literal("add_open_question"), page: PageRef, text: Text.max(MAX_QUESTION_CHARS) }),
  z.strictObject({ op: z.literal("resolve_open_question"), question: PageRef }),
]);
export type Op = z.infer<typeof Op>;

/** Another data point for a claim: kept next to it, never replacing it (R-KB-06). */
export interface Conflict {
  text: string;
  reason: string;
}
export interface ClaimState {
  id: string;
  text: string;
  origin: "source" | "model";
  conflicts?: Conflict[];
}
export interface QuestionState {
  id: string;
  text: string;
  status: "open" | "resolved" | "removed";
}
export interface LinkState {
  /** Page ids, a < b (a pair is stored once). A removed pair stays here so it is never proposed again. */
  a: string;
  b: string;
  reason: string;
  status: "active" | "removed";
}
export interface PageState {
  id: string;
  title: string;
  summary: string[];
  claims: ClaimState[];
  questions?: QuestionState[];
}
export interface CardState {
  id: string;
  claimId: string;
  status: "proposed" | "active" | "suspended" | "discarded" | "retired";
}
export interface KbState {
  pages: Record<string, PageState>;
  /** Passed through untouched: operations cannot change a card (R-CARD-06). */
  cards: CardState[];
  links?: LinkState[];
}

/** A card that is still in the user's hands: a proposal, an active card or a suspended one. */
export const isLiveCard = (c: CardState) => c.status === "proposed" || c.status === "active" || c.status === "suspended";

export interface KbEvent {
  kind: "page_created" | "claim_added" | "summary_set" | "claim_revised" | "card_update_proposed" | "contradiction_flagged" | "link_added" | "question_added" | "question_resolved";
  page: string;
  detail: Record<string, unknown>;
}

export type ApplyResult = { ok: true; state: KbState; events: KbEvent[] } | { ok: false; errors: string[] };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Validates and applies a batch. `ctx.sourceText` is the text the claims must be quoted from (R-KB-05);
 * `ctx.newPageId` is the id given to the page a `create_page` makes.
 */
export function applyOps(state: KbState, rawOps: unknown, ctx: { sourceText: string; newPageId: string }): ApplyResult {
  const parsed = z.array(Op).min(1).safeParse(rawOps);
  if (!parsed.success) return { ok: false, errors: [z.prettifyError(parsed.error)] };

  const errors: string[] = [];
  const pages: Record<string, PageState> = Object.fromEntries(Object.entries(state.pages).map(([id, p]) => [id, { ...p, claims: p.claims.map((c) => ({ ...c, ...(c.conflicts ? { conflicts: [...c.conflicts] } : {}) })), summary: [...p.summary], ...(p.questions ? { questions: p.questions.map((q) => ({ ...q })) } : {}) }]));
  const links: LinkState[] = (state.links ?? []).map((l) => ({ ...l }));
  const events: KbEvent[] = [];
  const resolve = (ref: string) => (ref === NEW_PAGE ? ctx.newPageId : ref);
  let created = false;

  parsed.data.forEach((op, i) => {
    const at = `op ${i + 1} (${op.op})`;
    if (op.op === "create_page") {
      if (created) return void errors.push(`${at}: a batch creates at most one page`);
      if (pages[ctx.newPageId]) return void errors.push(`${at}: page ${ctx.newPageId} already exists`);
      created = true;
      pages[ctx.newPageId] = { id: ctx.newPageId, title: op.title, summary: op.summary, claims: [] };
      events.push({ kind: "page_created", page: ctx.newPageId, detail: { title: op.title } });
      return;
    }
    if (op.op === "revise_claim" || op.op === "flag_contradiction") {
      const page = Object.values(pages).find((p) => p.claims.some((c) => c.id === op.claim));
      const claim = page?.claims.find((c) => c.id === op.claim);
      if (!page || !claim) return void errors.push(`${at}: unknown claim "${op.claim}"`);
      const liveCards = state.cards.filter((c) => c.claimId === claim.id && isLiveCard(c)).map((c) => c.id);
      if (op.op === "flag_contradiction") {
        if (norm(op.new_data) === norm(claim.text)) return void errors.push(`${at}: the new data is the claim itself`);
        // Both data points are kept; the claim's text and its cards are not touched.
        claim.conflicts = [...(claim.conflicts ?? []), { text: op.new_data, reason: op.reason }];
        events.push({ kind: "contradiction_flagged", page: page.id, detail: { claim: claim.id, new_data: op.new_data, reason: op.reason, cardIds: liveCards } });
        return;
      }
      if (norm(op.text) === norm(claim.text)) return void errors.push(`${at}: the revision is the claim itself`);
      if (page.claims.some((c) => c.id !== claim.id && norm(c.text) === norm(op.text))) return void errors.push(`${at}: the page already has the revised claim`);
      if (liveCards.length) {
        // R-CARD-06: a claim with a live card is never edited by the AI. The change waits as a proposal for the user.
        events.push({ kind: "card_update_proposed", page: page.id, detail: { claim: claim.id, from: claim.text, to: op.text, reason: op.reason, cardIds: liveCards } });
        return;
      }
      events.push({ kind: "claim_revised", page: page.id, detail: { claim: claim.id, from: claim.text, to: op.text, reason: op.reason } });
      claim.text = op.text;
      return;
    }
    if (op.op === "link_pages") {
      const a = resolve(op.page_a);
      const b = resolve(op.page_b);
      if (!pages[a]) return void errors.push(`${at}: unknown page "${op.page_a}"`);
      if (!pages[b]) return void errors.push(`${at}: unknown page "${op.page_b}"`);
      if (a === b) return void errors.push(`${at}: a page cannot link to itself`);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      // An existing pair, active or removed, is left alone: a removed pair is never proposed again (R-KB-13).
      if (links.some((l) => l.a === lo && l.b === hi)) return;
      links.push({ a: lo, b: hi, reason: op.reason, status: "active" });
      events.push({ kind: "link_added", page: a, detail: { other: b, reason: op.reason } });
      return;
    }
    if (op.op === "resolve_open_question") {
      const page = Object.values(pages).find((p) => p.questions?.some((q) => q.id === op.question));
      const question = page?.questions?.find((q) => q.id === op.question);
      if (!page || !question) return void errors.push(`${at}: unknown question "${op.question}"`);
      if (question.status !== "open") return void errors.push(`${at}: the question is not open`);
      question.status = "resolved";
      events.push({ kind: "question_resolved", page: page.id, detail: { question: question.id } });
      return;
    }
    const page = pages[resolve(op.page)];
    if (!page) return void errors.push(`${at}: unknown page "${op.page}"`);
    if (op.op === "add_open_question") {
      const questions = (page.questions ??= []);
      if (questions.filter((q) => q.status === "open").length >= MAX_OPEN_QUESTIONS) return void errors.push(`${at}: page "${page.title}" already has ${MAX_OPEN_QUESTIONS} open questions`);
      if (questions.some((q) => q.status === "open" && norm(q.text) === norm(op.text))) return void errors.push(`${at}: the page already has this open question`);
      questions.push({ id: `${page.id}?${questions.length + 1}`, text: op.text, status: "open" });
      events.push({ kind: "question_added", page: page.id, detail: { text: op.text } });
      return;
    }
    if (op.op === "set_summary") {
      page.summary = op.summary;
      events.push({ kind: "summary_set", page: page.id, detail: { bullets: op.summary.length } });
      return;
    }
    // add_claim
    if (op.origin === "source" && !op.excerpt) return void errors.push(`${at}: a claim from the source must cite an excerpt`);
    if (op.origin === "source" && !isGrounded(op.excerpt!, ctx.sourceText)) return void errors.push(`${at}: the excerpt is not in the source text`);
    if (page.claims.some((c) => norm(c.text) === norm(op.text))) return void errors.push(`${at}: the page already has this claim`);
    if (page.claims.length >= MAX_CLAIMS_PER_PAGE) return void errors.push(`${at}: page "${page.title}" is full (${MAX_CLAIMS_PER_PAGE} claims), it needs a split`);
    const claim: ClaimState = { id: `${page.id}#${page.claims.length + 1}`, text: op.text, origin: op.origin };
    page.claims.push(claim);
    events.push({ kind: "claim_added", page: page.id, detail: { text: op.text, origin: op.origin } });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, state: { pages, cards: state.cards, links }, events };
}

export const emptyState = (): KbState => ({ pages: {}, cards: [] });

export interface ProposedClaim {
  text: string;
  origin: "source" | "model";
  excerpt?: string;
}

/**
 * The claims of an extraction that a page can take, in order: each one is checked against the page as it would be after
 * the claims before it (grounding, repeats, size limit). Anything refused is returned with its reason, so one bad claim
 * never costs the others.
 */
export function acceptableClaims(page: PageState, claims: readonly ProposedClaim[], sourceText: string): { accepted: ProposedClaim[]; rejected: { claim: ProposedClaim; reason: string }[] } {
  let state: KbState = { pages: { [page.id]: page }, cards: [] };
  const accepted: ProposedClaim[] = [];
  const rejected: { claim: ProposedClaim; reason: string }[] = [];
  for (const claim of claims) {
    const op = { op: "add_claim", page: page.id, text: claim.text, origin: claim.origin, ...(claim.excerpt ? { excerpt: claim.excerpt } : {}) };
    const r = applyOps(state, [op], { sourceText, newPageId: "" });
    if (r.ok) {
      state = r.state;
      accepted.push(claim);
    } else rejected.push({ claim, reason: r.errors.join("; ") });
  }
  return { accepted, rejected };
}
