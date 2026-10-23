/** Card quality validator (R-CARD-03) and per-source cap (R-CARD-04, D20). Pure. */

import { MAX_REQUESTED_CARDS } from "./card-request";

export const MAX_CARDS_PER_SOURCE = 8;
export const MAX_ANSWER_CHARS = 280;
export const MAX_QUESTION_CHARS = 280;

export interface CardCandidate {
  claimIndex: number;
  question: string;
  answer: string;
  /** 1 = most important. */
  rank: number;
}

export type RejectReason = "empty" | "too_long" | "yes_no" | "context_reference" | "about_the_author" | "no_question_mark" | "duplicate" | "over_cap";

/** Phrases that make a card depend on context that will be gone months later. */
const CONTEXT_REFERENCE =
  /\b(selon|d['’]apr[èe]s|dans)\s+(l['’]|le |la |ce |cet |cette )?(article|texte|document|source|note|mail|e-?mail|vid[ée]o|podcast|passage)\b|\b(according to|in|from)\s+(the|this)\s+(article|text|document|source|note|email|video|podcast|passage)\b|\b(que dit|qu['’]est-ce que dit|what does)\s+(l['’]|le |la |the )?(article|texte|auteur|author|source|document|text)\b|\b(ci-dessus|above|ce texte|this text)\b/i;

/** Cards about the person who wrote or read the source instead of its subject ("what did the author learn?"). */
const ABOUT_THE_AUTHOR = /\b(l['’]auteur|l['’]utilisateur|the author|the user|the writer)\b/i;
const WHO_QUESTION = /^(qui|who)\b/i;

const YES_NO_START =
  /^(est-ce|est ce|is|are|was|were|does|do|did|can|could|should|will|would|has|have|had)\b/i;
const YES_NO_FR_INVERSION = /^(est|sont|a|ont|peut|peuvent|doit|doivent|faut|existe)-(il|elle|ils|elles|on|t-il|t-elle)\b/i;

export function checkCard(c: Pick<CardCandidate, "question" | "answer">): RejectReason | null {
  const q = c.question.trim();
  const a = c.answer.trim();
  if (!q || !a) return "empty";
  if (q.length > MAX_QUESTION_CHARS || a.length > MAX_ANSWER_CHARS) return "too_long";
  if (!q.includes("?")) return "no_question_mark";
  if (YES_NO_START.test(q) || YES_NO_FR_INVERSION.test(q)) return "yes_no";
  if (CONTEXT_REFERENCE.test(q) || CONTEXT_REFERENCE.test(a)) return "context_reference";
  if (!WHO_QUESTION.test(q) && (ABOUT_THE_AUTHOR.test(q) || ABOUT_THE_AUTHOR.test(a))) return "about_the_author";
  return null;
}

export interface ValidatedCards {
  accepted: CardCandidate[];
  rejected: { card: CardCandidate; reason: RejectReason }[];
}

/** Same text once case, accents, punctuation and spacing are ignored. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The most cards a source gets: the number the user asked for (D64), else the default of 8 (D20). */
export function cardCap(requested?: number | null): number {
  return requested && requested > 0 ? Math.min(Math.floor(requested), MAX_REQUESTED_CARDS) : MAX_CARDS_PER_SOURCE;
}

/**
 * Keeps valid, non-duplicate cards ranked by importance, at most `max` (the rest are `over_cap`).
 * A second card on the same claim is a duplicate when its question or its answer repeats the first (R-CARD-09):
 * it must test another angle.
 */
export function validateCards(candidates: readonly CardCandidate[], max = MAX_CARDS_PER_SOURCE): ValidatedCards {
  const rejected: ValidatedCards["rejected"] = [];
  const questions = new Set<string>();
  const answersByClaim = new Set<string>();
  const valid: CardCandidate[] = [];
  for (const card of [...candidates].sort((x, y) => x.rank - y.rank)) {
    const reason = checkCard(card);
    const question = normalizeText(card.question);
    const answer = `${card.claimIndex}|${normalizeText(card.answer)}`;
    if (reason) rejected.push({ card, reason });
    else if (questions.has(question) || answersByClaim.has(answer)) rejected.push({ card, reason: "duplicate" });
    else {
      questions.add(question);
      answersByClaim.add(answer);
      valid.push(card);
    }
  }
  for (const card of valid.slice(max)) rejected.push({ card, reason: "over_cap" });
  return { accepted: valid.slice(0, max), rejected };
}

export type DropReason = RejectReason | "invalid_claim" | "not_enough_facts";
/** Display order of the reasons. */
export const DROP_REASONS: readonly DropReason[] = ["duplicate", "yes_no", "no_question_mark", "context_reference", "about_the_author", "too_long", "empty", "invalid_claim", "over_cap", "not_enough_facts"];

/** What a source got against what the user asked for (R-CARD-10). Counts only, never any card text. */
export interface CardShortfall {
  requested: number;
  kept: number;
  dropped: Partial<Record<DropReason, number>>;
}

/**
 * Null when the user asked for no number or got it. Otherwise the reasons cards were dropped, plus
 * `not_enough_facts` for the part that nothing explains (the model proposed fewer cards than asked).
 */
export function cardShortfall(requested: number | null | undefined, kept: number, rejected: readonly { reason: RejectReason }[], invalidClaim = 0): CardShortfall | null {
  if (!requested || kept >= requested) return null;
  const dropped: CardShortfall["dropped"] = {};
  for (const r of rejected) dropped[r.reason] = (dropped[r.reason] ?? 0) + 1;
  if (invalidClaim > 0) dropped.invalid_claim = invalidClaim;
  const explained = Object.values(dropped).reduce((a, b) => a + (b ?? 0), 0);
  const missing = requested - kept - explained;
  if (missing > 0) dropped.not_enough_facts = missing;
  return { requested, kept, dropped };
}
