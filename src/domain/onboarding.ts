/** First-run card (R-ONB-02, R-ONB-04): the ticks come from the user's own data, never from stored progress. Pure. */

export interface FirstRunCounts {
  captures: number;
  keptCards: number;
  reviews: number;
}
export interface FirstRunSteps {
  capture: boolean;
  keep: boolean;
  review: boolean;
}

export const firstRunSteps = (c: FirstRunCounts): FirstRunSteps => ({ capture: c.captures > 0, keep: c.keptCards > 0, review: c.reviews > 0 });

/** Shown while at least one step is open and the user has not hidden it. A user with all three done never sees it. */
export function showFirstRun(steps: FirstRunSteps, dismissedAt: string | null): boolean {
  if (dismissedAt) return false;
  return !(steps.capture && steps.keep && steps.review);
}

/** `mailto:` to the user's own address with a suggested note. Nothing else about the user goes in it. */
export function tryMailto(address: string, subject: string, body: string): string {
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
