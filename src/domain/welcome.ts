/** First-sign-in walkthrough (R-ONB-07, R-ONB-08, D56): step parsing, neighbours and when `/` offers it. Pure. */

export const WELCOME_STEPS = 5;

/** A step from the URL: an integer from 1 to WELCOME_STEPS written without sign, space or leading zero, else null (404). */
export function parseWelcomeStep(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return n <= WELCOME_STEPS ? n : null;
}

export interface WelcomeNav {
  prev: number | null;
  next: number | null;
}

export const welcomeNav = (step: number): WelcomeNav => ({
  prev: step > 1 ? step - 1 : null,
  next: step < WELCOME_STEPS ? step + 1 : null,
});

/** `/` offers the walkthrough while the account has neither skipped nor finished it. */
export const needsWelcome = (doneAt: string | null | undefined): boolean => !doneAt;
