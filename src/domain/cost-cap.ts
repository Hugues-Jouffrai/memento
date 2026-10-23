/** Per-user AI cost cap (D53). Pure: compares what a user spent with their limits. */

/** Stages that call the AI. A job of another stage always runs. */
export const AI_STAGES: ReadonlySet<string> = new Set(["file", "extract", "cards"]);
/** How long a held job waits before the cap is checked again. */
export const CAP_RECHECK_MS = 60 * 60 * 1000;

export interface Spend {
  dayUsd: number;
  monthUsd: number;
}
export interface Caps {
  dayUsd: number;
  monthUsd: number;
}
export type CapStatus = { held: false } | { held: true; window: "day" | "month" };

/** A cap of 0 holds everything; spending exactly the cap holds too (the cap is a ceiling, not an allowance). */
export function capStatus(spend: Spend, caps: Caps): CapStatus {
  if (spend.monthUsd >= caps.monthUsd) return { held: true, window: "month" };
  if (spend.dayUsd >= caps.dayUsd) return { held: true, window: "day" };
  return { held: false };
}

export const holdUntil = (now: Date) => new Date(now.getTime() + CAP_RECHECK_MS);
