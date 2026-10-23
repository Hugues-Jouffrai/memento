import type { SupabaseClient } from "@supabase/supabase-js";
import { NEW_CARD_FIRST_DAY_REVIEWS, estimateMinutes, medianSecondsPerReview, newCardAllowance } from "@/domain/scheduling";
import { isStudyDay, localDayStart } from "@/domain/time";

export interface QueueProfile {
  timezone: string;
  daily_minutes: number;
  max_new_cards: number;
  study_days: number[];
  desired_retention: number;
  language: "fr" | "en";
}

export interface ReviewCard {
  card_id: string;
  question: string;
  answer: string;
  version: number;
  claim_id: string;
  source_id: string;
  state: {
    due: string;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    learning_steps: number;
    reps: number;
    lapses: number;
    state: 0 | 1 | 2 | 3;
    last_review: string | null;
  };
}

export interface QueueSummary {
  profile: QueueProfile;
  /** Existing cards due by the end of the user's local day (not new). */
  dueReviews: number;
  /** New cards the budget lets us introduce today. */
  newToday: number;
  trayCount: number;
  /** Estimated minutes for today's reviews plus the new cards (R-NOT-01). */
  minutes: number;
  /** Milliseconds already spent reviewing today. */
  spentMs: number;
  /** The user's measured median seconds per review (default until enough reviews, D45). */
  secondsPerReview: number;
  /** False on a day outside the user's study days. */
  studyDay: boolean;
}

const DAY_MS = 86_400_000;

interface StateRow {
  card_id: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  last_review: string | null;
  card: { question: string; answer: string; version: number; claim_id: string; source_id: string; rank: number; kept_at: string | null };
}

async function activeStates(db: SupabaseClient, userId: string): Promise<StateRow[]> {
  const { data, error } = await db
    .from("fsrs_state")
    .select("card_id,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,state,last_review,card:card!inner(question,answer,version,claim_id,source_id,rank,kept_at,status)")
    .eq("user_id", userId)
    .eq("card.status", "active");
  if (error) throw new Error(`activeStates: ${error.message}`);
  return (data ?? []) as unknown as StateRow[];
}

const toReviewCard = (r: StateRow): ReviewCard => ({
  card_id: r.card_id,
  question: r.card.question,
  answer: r.card.answer,
  version: r.card.version,
  claim_id: r.card.claim_id,
  source_id: r.card.source_id,
  state: {
    due: r.due,
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    learning_steps: r.learning_steps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    last_review: r.last_review,
  },
});

export async function loadProfile(db: SupabaseClient, userId: string): Promise<QueueProfile> {
  const { data, error } = await db
    .from("profile")
    .select("timezone,daily_minutes,max_new_cards,study_days,desired_retention,language")
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error(`profile for ${userId} not found`);
  return { ...data, desired_retention: Number(data.desired_retention) } as QueueProfile;
}

async function todayStats(db: SupabaseClient, userId: string, since: Date) {
  const { data, error } = await db
    .from("review_log")
    .select("card_id,duration_ms,state_before")
    .eq("user_id", userId)
    .gte("reviewed_at", since.toISOString());
  if (error) throw new Error(`todayStats: ${error.message}`);
  const rows = data ?? [];
  return {
    spentMs: rows.reduce((n, r) => n + ((r.duration_ms as number | null) ?? 10_000), 0),
    introducedToday: rows.filter((r) => (r.state_before as { state?: number }).state === 0).length,
    cardsSeen: new Set(rows.map((r) => r.card_id as string)),
  };
}

/** Median over the user's last 200 timed reviews (R-SCH-04, D30 f). */
export async function loadSecondsPerReview(db: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await db
    .from("review_log")
    .select("duration_ms")
    .eq("user_id", userId)
    .not("duration_ms", "is", null)
    .order("reviewed_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`loadSecondsPerReview: ${error.message}`);
  return medianSecondsPerReview((data ?? []).map((r) => r.duration_ms as number | null));
}

export async function summarize(db: SupabaseClient, userId: string, now: Date): Promise<QueueSummary> {
  const profile = await loadProfile(db, userId);
  const dayStart = localDayStart(now, profile.timezone);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const [states, stats, secondsPerReview, tray] = await Promise.all([
    activeStates(db, userId),
    todayStats(db, userId, dayStart),
    loadSecondsPerReview(db, userId),
    db.from("card").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("status", "proposed"),
  ]);
  const studyDay = isStudyDay(now, profile.timezone, profile.study_days);
  const dueReviews = states.filter((s) => s.state !== 0 && new Date(s.due) <= dayEnd).length;
  const newAvailable = states.filter((s) => s.state === 0).length;
  const allowance = newCardAllowance({
    maxNewCards: profile.max_new_cards,
    dailyMinutes: profile.daily_minutes,
    dueReviews,
    introducedToday: stats.introducedToday,
    secondsPerReview,
    secondsSpentToday: stats.spentMs / 1000,
    studyDay,
  });
  const newToday = Math.min(allowance, newAvailable);
  return {
    profile,
    dueReviews,
    newToday,
    trayCount: tray.count ?? 0,
    minutes: estimateMinutes(dueReviews + newToday * NEW_CARD_FIRST_DAY_REVIEWS, secondsPerReview),
    spentMs: stats.spentMs,
    secondsPerReview,
    studyDay,
  };
}

/** Position of the shown card in today's session: "n / total" (cards seen today, plus the ones still to come). */
export interface SessionProgress {
  n: number;
  total: number;
}

export type NextCard =
  | { kind: "card"; card: ReviewCard; isNew: boolean; progress: SessionProgress }
  | { kind: "budget_reached" }
  | { kind: "done" };

/**
 * R-REV-02 / R-SCH-06: due cards first (oldest due first), then today's new cards. When the time budget is
 * used up the session says so instead of continuing silently, unless the user chose to continue.
 */
export async function nextCard(db: SupabaseClient, userId: string, now: Date, opts: { continueAnyway?: boolean } = {}): Promise<NextCard> {
  const summary = await summarize(db, userId, now);
  const seen = (await todayStats(db, userId, localDayStart(now, summary.profile.timezone))).cardsSeen;
  const budgetMs = summary.profile.daily_minutes * 60_000;
  if (!opts.continueAnyway && summary.spentMs >= budgetMs) return { kind: "budget_reached" };

  const states = await activeStates(db, userId);
  // Cards due later today only appear once nothing is due now, so a learning step is not shown early.
  const dueNow = states
    .filter((s) => s.state !== 0 && new Date(s.due) <= now)
    .sort((x, y) => new Date(x.due).getTime() - new Date(y.due).getTime());
  const fresh = summary.newToday > 0 ? states.filter((s) => s.state === 0).sort((a, b) => a.card.rank - b.card.rank || (a.card.kept_at ?? "").localeCompare(b.card.kept_at ?? "")).slice(0, summary.newToday) : [];
  // Cards already reviewed today (a re-learn coming back) are not counted twice.
  const progressFor = (shown: StateRow): SessionProgress => {
    const ahead = new Set([...dueNow, ...fresh].map((s) => s.card_id).filter((id) => !seen.has(id)));
    const n = seen.has(shown.card_id) ? seen.size : seen.size + 1;
    return { n, total: Math.max(n, seen.size + ahead.size) };
  };
  if (dueNow[0]) return { kind: "card", card: toReviewCard(dueNow[0]), isNew: false, progress: progressFor(dueNow[0]) };
  if (fresh[0]) return { kind: "card", card: toReviewCard(fresh[0]), isNew: true, progress: progressFor(fresh[0]) };
  return { kind: "done" };
}
