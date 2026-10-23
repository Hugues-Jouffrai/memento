/** Is a fetched page worth reading? (R-PIPE-02: paywalled or empty pages get a receipt asking for the text.) Pure. */

export type PageVerdict = "ok" | "paywall" | "empty";

/** Fewer characters than this is not an article (JS-only pages and cookie walls come out like this). */
export const MIN_PAGE_CHARS = 400;

const PAYWALL_MARKERS =
  /(subscribe to (continue|read|unlock)|subscribers only|for subscribers|sign in to (read|continue)|log ?in to (read|continue)|create (a free )?account to (read|continue)|réservé aux abonnés|abonnez-vous pour (lire|continuer)|connectez-vous pour (lire|continuer)|contenu (réservé|premium)|premium content|you('ve| have) reached your (free )?(article )?limit)/i;

export function classifyPage(page: { status: number; text: string }): PageVerdict {
  if (page.status === 401 || page.status === 402 || page.status === 403) return "paywall";
  const text = page.text.trim();
  if (text.length < MIN_PAGE_CHARS) return PAYWALL_MARKERS.test(text) ? "paywall" : "empty";
  // A long page can still be a teaser: markers in the first part of a short-ish text.
  if (text.length < 2500 && PAYWALL_MARKERS.test(text)) return "paywall";
  return "ok";
}
