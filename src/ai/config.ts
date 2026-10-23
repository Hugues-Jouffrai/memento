/**
 * Model names, routing and prices live here and nowhere else (CLAUDE.md).
 * Prices: USD per 1M tokens, paid tier, standard.
 * Source: https://ai.google.dev/gemini-api/docs/pricing, snapshot retrieved 2026-10-14
 * (snapshot of the provider pricing page).
 * Re-check before relying on them. gemini-embedding-2: $0.20 per 1M input tokens (batch $0.10), read from the
 * official pricing page on 2026-10-14; the pricing snapshot above does not list it.
 */

export const MODELS = {
  smart: "gemini-3.8-flash",
  cheap: "gemini-3.5-flash-lite",
  embedding: "gemini-embedding-2",
} as const;

/** Which model each pipeline stage uses. enrich, cards and judge chosen from the enrichment eval (D37). */
export const STAGE_MODEL: Record<string, string> = {
  smoke: MODELS.cheap,
  extract: MODELS.cheap,
  claims: MODELS.cheap,
  enrich: MODELS.smart,
  refine: MODELS.cheap,
  cards: MODELS.smart,
  match: MODELS.smart,
  revise: MODELS.smart,
  link: MODELS.smart,
  transcribe: MODELS.cheap,
  judge: MODELS.smart,
};

export const DEFAULT_MODEL = MODELS.cheap;

export interface PriceEntry {
  /** ISO date (UTC) from which this price applies. */
  from: string;
  inputPerM: number;
  outputPerM: number;
}

export const PRICES: Record<string, PriceEntry[]> = {
  "gemini-3.8-flash": [
    { from: "1970-01-01", inputPerM: 0.75, outputPerM: 3.75 },
    // Introductory price ends 2026-12-31; doubles from 2027-01-01.
    { from: "2027-01-01", inputPerM: 1.5, outputPerM: 7.5 },
  ],
  "gemini-3.5-flash-lite": [{ from: "1970-01-01", inputPerM: 0.3, outputPerM: 2.5 }],
  "gemini-embedding-2": [{ from: "1970-01-01", inputPerM: 0.2, outputPerM: 0 }],
};

/** Embedding vectors: dimension requested from the model (recommended values 768, 1536, 3072; truncated vectors are
 * normalised by the model). Stored with the model id next to each vector. Chosen in D40. */
export const EMBEDDING_DIMENSIONS = 768;

export const MAX_ATTEMPTS = 3;
