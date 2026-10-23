import { z } from "zod";

/**
 * Ceilings on what a model may return (D64). A user who asks for up to 30 cards (MAX_REQUESTED_CARDS) needs up to 30
 * claims; a second card per important claim means the model may also propose a few more cards than were asked for.
 */
export const MAX_CLAIMS_OUTPUT = 30;
export const MAX_ENRICH_CLAIMS = 30;
export const MAX_CARDS_OUTPUT = 40;

/** ISO 639-1 code of the source language (R-PIPE-04). Not limited to the two UI languages. */
export const Lang = z.string().regex(/^[a-z]{2}$/);

/** C1 control characters and the replacement character: signs of a garbled model output (seen: U+0092 instead of "é"). */
export const GARBLED = /[\u0080-\u009f\ufffd]/;

/** Text from a model: non-empty and free of garbled characters, so a glitch triggers the gateway's retry with feedback. */
export const Clean = z
  .string()
  .min(1)
  .refine((s) => !GARBLED.test(s), { message: "contains corrupted characters (control or replacement characters): rewrite the text with proper accented letters" });

export const SmokeOutput = z.object({
  language: Lang,
  topic: z.string().min(1),
});

export const ExtractOutput = z.object({
  language: Lang,
  topic: z.string().min(1),
  claims: z
    .array(z.object({ text: Clean, excerpt: z.string().min(1).max(600) }))
    .min(1)
    .max(8),
});
export type ExtractOutput = z.infer<typeof ExtractOutput>;

/** M1 pipeline stage `claims` (prompt claims/vN). */
export const ClaimsOutput = z.object({
  language: Lang,
  topic: Clean.max(80),
  summary: z.array(Clean).min(1).max(7),
  claims: z
    .array(z.object({ text: Clean, excerpt: z.string().min(1).max(600) }))
    .min(1)
    .max(MAX_CLAIMS_OUTPUT),
  /** Questions the source raises but does not answer (prompt claims/v4, D66, R-KB-14). Usually empty. */
  open_questions: z.array(Clean.max(200)).max(3).default([]),
});
export type ClaimsOutput = z.infer<typeof ClaimsOutput>;

/**
 * Stage `enrich` (R-PIPE-05): a sparse personal note names a subject; the model drafts the key facts from its own
 * knowledge. Facts stated in the note keep origin `source` (with a verbatim excerpt); the rest is origin `model`.
 */
export const EnrichOutput = z.object({
  language: Lang,
  /** Reasoning written BEFORE the claims (prompt enrich/v2): what the note is about and which concrete facts matter. */
  analysis: z
    .object({
      subject: z.string(),
      aspects: z.array(z.string()),
      key_facts: z.array(z.string()),
      doubts: z.array(z.string()),
    })
    .optional(),
  topic: Clean.max(80),
  summary: z.array(Clean).min(1).max(7),
  claims: z
    .array(
      z.object({
        text: Clean,
        origin: z.enum(["source", "model"]),
        excerpt: z.string().max(600).optional(),
      }),
    )
    .min(1)
    .max(MAX_ENRICH_CLAIMS),
});
export type EnrichOutput = z.infer<typeof EnrichOutput>;

/** M1 pipeline stage `cards` (prompt cards/vN). `claim` is the 1-based number of the claim in the prompt. */
export const CardsOutput = z.object({
  cards: z
    .array(
      z.object({
        claim: z.number().int().min(1),
        question: Clean,
        answer: Clean,
        rank: z.number().int().min(1),
      }),
    )
    .min(1)
    .max(MAX_CARDS_OUTPUT),
});
export type CardsOutput = z.infer<typeof CardsOutput>;

/** Stage `transcribe` (vision): the text of a scanned PDF or the text and content of an image. */
export const TranscribeOutput = z.object({
  language: Lang,
  title: z.string().max(200).nullable(),
  text: Clean,
});
export type TranscribeOutput = z.infer<typeof TranscribeOutput>;

/** Eval-only stage `judge`: a critical review of claims and cards (1-5 per criterion). */
export const JudgeOutput = z.object({
  specificity: z.number().int().min(1).max(5),
  relevance: z.number().int().min(1).max(5),
  question_quality: z.number().int().min(1).max(5),
  accuracy: z.number().int().min(1).max(5),
  issues: z.array(z.string()).max(6),
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;

/** Stage `match` (M3 step 1, R-KB-02): does the new source belong on one of the shortlisted pages? `page` is 1-based. */
export const MatchOutput = z.object({
  reasoning: Clean,
  decision: z.enum(["update", "new"]),
  page: z.number().int().min(1).nullable(),
  confidence: z.number().min(0).max(1),
});
export type MatchOutput = z.infer<typeof MatchOutput>;

/** Stage `revise` (M3 step 3, R-KB-06): disagreements between a page's facts and a new source's facts. Numbers are 1-based. */
export const ReviseOutput = z.object({
  reasoning: Clean,
  findings: z
    .array(
      z.object({
        kind: z.enum(["revise", "contradiction"]),
        existing: z.number().int().min(1),
        new: z.number().int().min(1),
        text: z.string().nullable(),
        reason: Clean,
      }),
    )
    .max(10),
  /** Open questions of the page that the new facts answer (prompt revise/v2); `question` is 1-based. */
  resolves: z.array(z.object({ question: z.number().int().min(1), reason: Clean })).max(3).default([]),
});
export type ReviseOutput = z.infer<typeof ReviseOutput>;

/** Stage `link` (M3 step 4, R-KB-12): which shortlisted pages are directly related to the new page. `candidate` is 1-based. */
export const LinkOutput = z.object({
  reasoning: Clean,
  links: z.array(z.object({ candidate: z.number().int().min(1), reason: Clean, confidence: z.number().min(0).max(1) })).max(5),
});
export type LinkOutput = z.infer<typeof LinkOutput>;
