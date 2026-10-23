import { Rating, State, createEmptyCard, fsrs, generatorParameters, type Card } from "ts-fsrs";

/** R-SCH-01: the FSRS library version is pinned (package.json) and stored with every state and log row. */
export const FSRS_VERSION = "5.4.2";

export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

/** Serialisable scheduling state: the columns of `fsrs_state`. */
export interface CardState {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  /** 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: 0 | 1 | 2 | 3;
  last_review: string | null;
}

const toCard = (s: CardState): Card => ({
  due: new Date(s.due),
  stability: s.stability,
  difficulty: s.difficulty,
  elapsed_days: s.elapsed_days,
  scheduled_days: s.scheduled_days,
  learning_steps: s.learning_steps,
  reps: s.reps,
  lapses: s.lapses,
  state: s.state as State,
  last_review: s.last_review ? new Date(s.last_review) : undefined,
});

const fromCard = (c: Card): CardState => ({
  due: c.due.toISOString(),
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: c.elapsed_days,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state as CardState["state"],
  last_review: c.last_review ? c.last_review.toISOString() : null,
});

export function newCardState(now: Date): CardState {
  return fromCard(createEmptyCard(now));
}

/**
 * Applies one review. Fuzz is off so that the same log always rebuilds the same state (R-SCH-02).
 * Short-term steps stay within the day (R-SCH-03).
 */
export function applyReview(state: CardState, grade: Grade, now: Date, desiredRetention: number): CardState {
  const f = fsrs(generatorParameters({ request_retention: desiredRetention, enable_fuzz: false, enable_short_term: true }));
  const ratingFor: Record<Grade, Rating.Again | Rating.Hard | Rating.Good | Rating.Easy> = {
    1: Rating.Again,
    2: Rating.Hard,
    3: Rating.Good,
    4: Rating.Easy,
  };
  return fromCard(f.next(toCard(state), now, ratingFor[grade]).card);
}

export interface LoggedReview {
  grade: Grade;
  at: string;
}

/** Rebuilds a card's state from its review log alone (R-SCH-02 replay). */
export function replayReviews(createdAt: Date, reviews: readonly LoggedReview[], desiredRetention: number): CardState {
  return reviews.reduce(
    (state, r) => applyReview(state, r.grade, new Date(r.at), desiredRetention),
    newCardState(createdAt),
  );
}

/** Whole days between two instants, as logged in `review_log.elapsed_days`. */
export function elapsedDays(lastReview: string | null, now: Date): number {
  if (!lastReview) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(lastReview).getTime()) / 86_400_000));
}

/** Seconds per review assumed until enough reviews are measured (R-SCH-04). */
export const DEFAULT_SECONDS_PER_REVIEW = 10;
/** Median needs at least this many timed reviews, else the default is used. */
export const MIN_TIMED_REVIEWS = 30;
/** A new card costs about this many reviews on its first day (learning steps) [assumption, D45]. */
export const NEW_CARD_FIRST_DAY_REVIEWS = 3;

/**
 * R-SCH-04 / D30 f: the user's median seconds per review from logged durations (ms, nulls ignored),
 * clamped to [3, 60] s. Falls back to the default below MIN_TIMED_REVIEWS samples.
 */
export function medianSecondsPerReview(durationsMs: readonly (number | null)[]): number {
  const xs = durationsMs.filter((d): d is number => d !== null && Number.isFinite(d) && d > 0).sort((a, b) => a - b);
  if (xs.length < MIN_TIMED_REVIEWS) return DEFAULT_SECONDS_PER_REVIEW;
  const mid = Math.floor(xs.length / 2);
  const median = xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
  return Math.min(60, Math.max(3, median / 1000));
}

/**
 * Share of the remaining budget the plan may use. The rest absorbs the repeats the due count cannot see:
 * cards rated Again come back within the session [assumption, tuned by the 180-day simulation, D45].
 */
export const BUDGET_HEADROOM = 0.8;

export interface AllowanceInput {
  maxNewCards: number;
  dailyMinutes: number;
  /** Reviews of existing cards still due today (the forecast load). */
  dueReviews: number;
  /** New cards already introduced today. */
  introducedToday: number;
  /** Seconds per review: the user's measured median (see medianSecondsPerReview). */
  secondsPerReview?: number;
  /** Time already spent reviewing today, in seconds (subtracted from the budget). */
  secondsSpentToday?: number;
  /** False on a day the user does not study: no new cards (R-SCH-05). Default true. */
  studyDay?: boolean;
}

/**
 * R-SCH-04 / D14: new cards still allowed today = min(max new per day minus those already introduced,
 * how many fit in the remaining time budget once the due reviews are counted, each new card costing
 * NEW_CARD_FIRST_DAY_REVIEWS reviews).
 */
export function newCardAllowance(i: AllowanceInput): number {
  if (i.studyDay === false) return 0;
  const per = i.secondsPerReview ?? DEFAULT_SECONDS_PER_REVIEW;
  const remainingSec = Math.max(0, i.dailyMinutes * 60 - (i.secondsSpentToday ?? 0));
  const reviewSlots = Math.floor((remainingSec * BUDGET_HEADROOM) / per) - i.dueReviews;
  const fitsInBudget = Math.max(0, Math.floor(reviewSlots / NEW_CARD_FIRST_DAY_REVIEWS));
  return Math.max(0, Math.min(i.maxNewCards - i.introducedToday, fitsInBudget));
}

/** Estimated minutes for a number of reviews, rounded up (shown in the reminder). */
export function estimateMinutes(reviews: number, secondsPerReview = DEFAULT_SECONDS_PER_REVIEW): number {
  return Math.ceil((reviews * secondsPerReview) / 60);
}

const GRADES: readonly Grade[] = [1, 2, 3, 4];

/**
 * R-SCH-07: the time from `now` until the card is due again, for each grade, exactly as `applyReview` would
 * schedule it (same function, so the preview and the stored result cannot disagree). Milliseconds.
 */
export function previewIntervals(state: CardState, now: Date, desiredRetention: number): Record<Grade, number> {
  const out = {} as Record<Grade, number>;
  for (const g of GRADES) out[g] = Math.max(new Date(applyReview(state, g, now, desiredRetention).due).getTime() - now.getTime(), 0);
  return out;
}

type IntervalUnit = "minute" | "hour" | "day" | "month" | "year";

/** The unit and rounded value shown for an interval: minutes under an hour, hours under a day, days under a month, and so on. */
export function intervalParts(ms: number): { unit: IntervalUnit; value: number } {
  const minutes = ms / 60_000;
  if (minutes < 60) return { unit: "minute", value: Math.max(Math.round(minutes), 1) };
  const hours = minutes / 60;
  if (hours < 24) return { unit: "hour", value: Math.round(hours) };
  const days = hours / 24;
  if (days < 31) return { unit: "day", value: Math.max(Math.round(days), 1) };
  if (days < 365) return { unit: "month", value: Math.round((days / 30.4375) * 10) / 10 };
  return { unit: "year", value: Math.round((days / 365.25) * 10) / 10 };
}

/**
 * "10 min", "4 j", "2 mois" (short) or "dans 4 jours" (long, for screen readers), in the user's language. The
 * wording comes from Intl, so no hard-coded strings.
 */
export function formatInterval(ms: number, locale: string, style: "short" | "long" = "short"): string {
  const { unit, value } = intervalParts(ms);
  if (style === "long") return new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "long" }).format(value, unit);
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: unit === "month" || unit === "year" ? "long" : "short", maximumFractionDigits: 1 }).format(value);
}
