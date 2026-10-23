/**
 * Owner report (R-ADMIN-01..07): pure aggregation over row arrays. No I/O, no clock of its own.
 * Aggregates only (D63): the report holds counts, sums, ratios and machine codes. Rows carry no
 * address, subject or error text, and the report never copies an id.
 */

// Resend Free plan limits, from Hugues's dashboard screenshot of 2026-10-17 (Free plan: 3,000 monthly, 100 daily).
export const RESEND_LIMIT_DAY = 100;
export const RESEND_LIMIT_MONTH = 3000;
/** Global AI budget for the whole app, in USD per month (Hugues, 2026-10-17, D63). `ai_call.cost_usd` is USD. */
export const AI_BUDGET_MONTH_USD = 50;
/** A queued job whose run_after passed by more than this is reported stuck (cron runs every minute). */
export const STUCK_QUEUED_MINUTES = 10;

export interface CaptureRow {
  user_id: string;
  status: string;
  created_at: string;
  parent_id: string | null;
  route: string | null;
  /** notes->>failReason */
  fail_reason: string | null;
  /** auth->>decision */
  decision: string | null;
  /** notes->cards: set when fewer cards were made than the user asked for (counts only, R-CARD-10). */
  cards?: { requested: number; kept: number; dropped: Record<string, number> } | null;
}
export interface JobRow {
  stage: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: string;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
}
export interface AiCallRow {
  at: string;
  user_id: string | null;
  stage: string;
  model: string;
  status: string;
  cost_usd: number | string | null;
  input_tokens: number | null;
  output_tokens: number | null;
}
export interface EmailRow {
  kind: string;
  status: string;
  created_at: string;
}
export interface ReviewRow {
  user_id: string;
  reviewed_at: string;
  rating: number;
  duration_ms: number | null;
}
export interface CardRow {
  user_id: string;
  status: string;
  created_at: string;
  kept_at: string | null;
}
export interface ProfileRow {
  id: string;
  created_at: string;
  ai_cap_day_usd: number | string;
  ai_cap_month_usd: number | string;
}
export interface AuthUserRow {
  last_sign_in_at: string | null;
}
export interface WaitlistRow {
  locale: string;
  confirmed_at: string;
}
export interface InviteRow {
  max_uses: number;
  uses: number;
  expires_at: string;
  revoked_at: string | null;
}

export interface OpsInput {
  now: Date;
  days: number;
  captures: CaptureRow[];
  jobs: JobRow[];
  aiCalls: AiCallRow[];
  emails: EmailRow[];
  reviews: ReviewRow[];
  cards: CardRow[];
  profiles: ProfileRow[];
  authUsers: AuthUserRow[];
  waitlist: WaitlistRow[];
  invites: InviteRow[];
}

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const dayKey = (iso: string | Date) => (typeof iso === "string" ? new Date(iso) : iso).toISOString().slice(0, 10);
const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));
const round = (n: number, d = 6) => Math.round(n * 10 ** d) / 10 ** d;

function bump(map: Record<string, number>, key: string, by = 1) {
  map[key] = (map[key] ?? 0) + by;
}
function daysList(now: Date, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(dayKey(new Date(now.getTime() - i * DAY)));
  return out;
}
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

export function buildOpsReport(input: OpsInput) {
  const { now, days } = input;
  const since = new Date(now.getTime() - days * DAY);
  const inWindow = (iso: string) => new Date(iso) >= since && new Date(iso) <= now;
  const today = dayKey(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dayList = daysList(now, days);

  // P1 captures (mails, not sub-sources: parent_id null)
  const caps = input.captures.filter((c) => c.parent_id == null && inWindow(c.created_at));
  const capByStatus: Record<string, number> = {};
  const capFail: Record<string, number> = {};
  const capRoute: Record<string, number> = {};
  const capReject: Record<string, number> = {};
  const capDay: Record<string, Record<string, number>> = {};
  for (const c of caps) {
    bump(capByStatus, c.status);
    bump(capRoute, c.route ?? "unknown");
    if (c.status === "failed") bump(capFail, c.fail_reason ?? "unknown");
    if (c.status === "rejected") bump(capReject, c.decision ?? "unknown");
    bump((capDay[dayKey(c.created_at)] ??= {}), c.status);
  }
  const captures = {
    total: caps.length,
    byStatus: capByStatus,
    failReasons: capFail,
    byRoute: capRoute,
    rejectDecisions: capReject,
    byDay: dayList.map((day) => ({ day, byStatus: capDay[day] ?? {}, total: sum(capDay[day] ?? {}) })),
  };

  // P2 jobs
  const stageState: Record<string, Record<string, number>> = {};
  let stuckQueued = 0;
  let expiredLease = 0;
  let retrying = 0;
  let failed = 0;
  let oldestQueuedMin: number | null = null;
  let newestDone: string | null = null;
  for (const j of input.jobs) {
    if (inWindow(j.created_at) || j.status === "queued" || j.status === "running" || j.status === "failed") {
      bump((stageState[j.stage] ??= {}), j.status);
    }
    if (j.status === "queued") {
      const late = (now.getTime() - new Date(j.run_after).getTime()) / MIN;
      if (late > STUCK_QUEUED_MINUTES) stuckQueued++;
      if (late > 0) oldestQueuedMin = Math.max(oldestQueuedMin ?? 0, Math.round(late));
      if (j.attempts > 0) retrying++;
    }
    if (j.status === "running" && j.lease_until && new Date(j.lease_until) < now) expiredLease++;
    if (j.status === "failed") failed++;
    if (j.status === "done" && (newestDone == null || j.updated_at > newestDone)) newestDone = j.updated_at;
  }
  const jobs = { byStageState: stageState, stuckQueued, expiredLease, retrying, failed, oldestQueuedMin, stuckThresholdMin: STUCK_QUEUED_MINUTES };

  // P3 AI cost
  let monthToDate = 0;
  let unpriced = 0;
  const aiByDay: Record<string, { calls: number; cost: number; errors: number }> = {};
  const aiByStage: Record<string, { calls: number; cost: number; errors: number }> = {};
  const aiByModel: Record<string, { calls: number; errors: number }> = {};
  const aiStatus: Record<string, number> = {};
  const spend24: Record<string, number> = {};
  const spend30: Record<string, number> = {};
  let windowCost = 0;
  let windowCalls = 0;
  for (const a of input.aiCalls) {
    const at = new Date(a.at);
    const cost = num(a.cost_usd);
    if (at >= monthStart && at <= now) monthToDate += cost;
    if (a.user_id && at <= now) {
      if (at.getTime() > now.getTime() - DAY) spend24[a.user_id] = (spend24[a.user_id] ?? 0) + cost;
      if (at.getTime() > now.getTime() - 30 * DAY) spend30[a.user_id] = (spend30[a.user_id] ?? 0) + cost;
    }
    if (!inWindow(a.at)) continue;
    windowCalls++;
    windowCost += cost;
    const err = a.status !== "ok" ? 1 : 0;
    if (a.cost_usd == null) unpriced++;
    bump(aiStatus, a.status);
    const d = (aiByDay[dayKey(a.at)] ??= { calls: 0, cost: 0, errors: 0 });
    d.calls++;
    d.cost += cost;
    d.errors += err;
    const s = (aiByStage[a.stage] ??= { calls: 0, cost: 0, errors: 0 });
    s.calls++;
    s.cost += cost;
    s.errors += err;
    const m = (aiByModel[a.model] ??= { calls: 0, errors: 0 });
    m.calls++;
    m.errors += err;
  }
  const pressure = (cap: (p: ProfileRow) => number, spend: Record<string, number>) => {
    const out = { over50: 0, over80: 0, over100: 0 };
    for (const p of input.profiles) {
      const c = cap(p);
      if (c <= 0) continue;
      const r = (spend[p.id] ?? 0) / c;
      if (r >= 0.5) out.over50++;
      if (r >= 0.8) out.over80++;
      if (r >= 1) out.over100++;
    }
    return out;
  };
  const doneNotes = caps.filter((c) => c.status === "done").length;
  const ai = {
    budgetMonthUsd: AI_BUDGET_MONTH_USD,
    monthToDateUsd: round(monthToDate),
    budgetPct: round((monthToDate / AI_BUDGET_MONTH_USD) * 100, 1),
    windowUsd: round(windowCost),
    windowCalls,
    unpricedCalls: unpriced,
    statusCounts: aiStatus,
    byDay: dayList.map((day) => ({ day, calls: aiByDay[day]?.calls ?? 0, costUsd: round(aiByDay[day]?.cost ?? 0), errors: aiByDay[day]?.errors ?? 0 })),
    byStage: Object.fromEntries(Object.entries(aiByStage).map(([k, v]) => [k, { calls: v.calls, costUsd: round(v.cost), errors: v.errors }])),
    byModel: aiByModel,
    costPerDoneCaptureUsd: doneNotes > 0 ? round(windowCost / doneNotes) : null,
    caps: {
      users: input.profiles.length,
      day: pressure((p) => num(p.ai_cap_day_usd), spend24),
      month: pressure((p) => num(p.ai_cap_month_usd), spend30),
    },
  };

  // P4 mails (lower bound: auth mails and waitlist confirmations are not in email_out)
  const mailDay: Record<string, { sent: number; failed: number }> = {};
  const mailKind: Record<string, number> = {};
  let sentMonth = 0;
  let failedMonth = 0;
  let remSentToday = 0;
  let remFailedToday = 0;
  for (const e of input.emails) {
    const at = new Date(e.created_at);
    if (at >= monthStart && at <= now) {
      if (e.status === "sent") sentMonth++;
      if (e.status === "failed") failedMonth++;
    }
    if (e.kind === "reminder" && dayKey(e.created_at) === today) {
      if (e.status === "sent") remSentToday++;
      if (e.status === "failed") remFailedToday++;
    }
    if (!inWindow(e.created_at)) continue;
    const d = (mailDay[dayKey(e.created_at)] ??= { sent: 0, failed: 0 });
    if (e.status === "sent") {
      d.sent++;
      bump(mailKind, e.kind);
    } else if (e.status === "failed") d.failed++;
  }
  const sentToday = mailDay[today]?.sent ?? 0;
  const mails = {
    lowerBound: true as const,
    note: "At least: sign-in mails (Supabase SMTP) and waitlist confirmations are not in email_out.",
    limits: { day: RESEND_LIMIT_DAY, month: RESEND_LIMIT_MONTH },
    sentToday,
    sentMonth,
    failedMonth,
    dayPct: round((sentToday / RESEND_LIMIT_DAY) * 100, 1),
    monthPct: round((sentMonth / RESEND_LIMIT_MONTH) * 100, 1),
    sentByKind: mailKind,
    byDay: dayList.map((day) => ({ day, sent: mailDay[day]?.sent ?? 0, failed: mailDay[day]?.failed ?? 0 })),
    reminders: { sentToday: remSentToday, failedToday: remFailedToday },
  };

  // P5 users and activity
  const revDay: Record<string, { reviews: number; users: Set<string> }> = {};
  const ratings: Record<string, number> = {};
  let durSum = 0;
  let durN = 0;
  for (const r of input.reviews) {
    if (!inWindow(r.reviewed_at)) continue;
    const d = (revDay[dayKey(r.reviewed_at)] ??= { reviews: 0, users: new Set() });
    d.reviews++;
    d.users.add(r.user_id);
    bump(ratings, String(r.rating));
    if (r.duration_ms != null) {
      durSum += r.duration_ms;
      durN++;
    }
  }
  const newProfiles: Record<string, number> = {};
  for (const p of input.profiles) if (inWindow(p.created_at)) bump(newProfiles, dayKey(p.created_at));
  const seen = { today: 0, week: 0, older: 0, never: 0 };
  for (const u of input.authUsers) {
    const age = u.last_sign_in_at ? now.getTime() - new Date(u.last_sign_in_at).getTime() : null;
    if (age == null) seen.never++;
    else if (age < DAY) seen.today++;
    else if (age < 7 * DAY) seen.week++;
    else seen.older++;
  }
  const activity = {
    profiles: input.profiles.length,
    newProfilesInWindow: sum(newProfiles),
    lastSeenBuckets: seen,
    byDay: dayList.map((day) => ({ day, reviews: revDay[day]?.reviews ?? 0, activeReviewers: revDay[day]?.users.size ?? 0, newProfiles: newProfiles[day] ?? 0 })),
  };
  const funnel = {
    profiles: input.profiles.length,
    withCapture: new Set(input.captures.map((c) => c.user_id)).size,
    withActiveCard: new Set(input.cards.filter((c) => c.status === "active").map((c) => c.user_id)).size,
    withReview: new Set(input.reviews.map((r) => r.user_id)).size,
  };

  // P8 card pipeline and review quality
  const cardStatus: Record<string, number> = {};
  for (const c of input.cards) if (inWindow(c.created_at)) bump(cardStatus, c.status);
  const kept = (cardStatus.active ?? 0) + (cardStatus.suspended ?? 0) + (cardStatus.retired ?? 0);
  const decided = kept + (cardStatus.discarded ?? 0);
  const shortReasons: Record<string, number> = {};
  let shortCaptures = 0;
  let shortRequested = 0;
  let shortKept = 0;
  for (const c of input.captures) {
    if (!c.cards || !inWindow(c.created_at)) continue;
    shortCaptures++;
    shortRequested += num(c.cards.requested);
    shortKept += num(c.cards.kept);
    for (const [reason, n] of Object.entries(c.cards.dropped ?? {})) bump(shortReasons, reason, num(n));
  }
  const cardPipeline = {
    createdByStatus: cardStatus,
    keepRatePct: decided > 0 ? round((kept / decided) * 100, 1) : null,
    // R-CARD-10: sources where fewer cards were made than asked; dropped cards by reason (counts only).
    shortfalls: { captures: shortCaptures, requested: shortRequested, kept: shortKept, droppedByReason: shortReasons },
  };
  const reviewQuality = { ratings, avgDurationMs: durN > 0 ? Math.round(durSum / durN) : null };

  // P6 waitlist (counts only)
  const byLocale: Record<string, number> = {};
  for (const w of input.waitlist) bump(byLocale, w.locale);
  const waitlist = {
    total: input.waitlist.length,
    byLocale,
    newInWindow: input.waitlist.filter((w) => inWindow(w.confirmed_at)).length,
    byDay: dayList.map((day) => ({ day, n: input.waitlist.filter((w) => dayKey(w.confirmed_at) === day).length })),
  };

  // P8 invites
  const live = input.invites.filter((i) => !i.revoked_at && new Date(i.expires_at) > now);
  const invites = {
    activeLinks: live.length,
    usesLeft: live.reduce((a, i) => a + Math.max(0, i.max_uses - i.uses), 0),
    nextExpiryInHours: live.length ? Math.round((Math.min(...live.map((i) => new Date(i.expires_at).getTime())) - now.getTime()) / (60 * MIN)) : null,
  };

  // P7 errors in the last 24 hours, as area:code counts
  const cutoff = now.getTime() - DAY;
  const errs: Record<string, number> = {};
  for (const c of input.captures) if (c.status === "failed" && new Date(c.created_at).getTime() >= cutoff) bump(errs, `capture:${c.fail_reason ?? "unknown"}`);
  for (const j of input.jobs) if (j.status === "failed" && new Date(j.updated_at).getTime() >= cutoff) bump(errs, `job:${j.stage}:failed`);
  for (const a of input.aiCalls) if (a.status !== "ok" && new Date(a.at).getTime() >= cutoff) bump(errs, `ai:${a.stage}:${a.status}`);
  for (const e of input.emails) if (e.status === "failed" && new Date(e.created_at).getTime() >= cutoff) bump(errs, `mail:${e.kind}:failed`);
  const errors = { last24h: errs, total: sum(errs) };

  const health = { newestDoneJobAgeMin: newestDone ? Math.round((now.getTime() - new Date(newestDone).getTime()) / MIN) : null };

  return { generatedAt: now.toISOString(), windowDays: days, health, captures, jobs, ai, mails, activity, funnel, waitlist, cardPipeline, reviewQuality, invites, errors };
}
export type OpsReport = ReturnType<typeof buildOpsReport>;
