import { describe, expect, it } from "vitest";
import { AI_BUDGET_MONTH_USD, buildOpsReport, RESEND_LIMIT_DAY, RESEND_LIMIT_MONTH, type OpsInput } from "./ops-report";

const now = new Date("2026-10-17T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const U1 = "11111111-aaaa-bbbb-cccc-000000000001";
const U2 = "22222222-aaaa-bbbb-cccc-000000000002";

function input(over: Partial<OpsInput> = {}): OpsInput {
  return {
    now,
    days: 30,
    captures: [
      { user_id: U1, status: "done", created_at: ago(1), parent_id: null, route: "token", fail_reason: null, decision: null },
      { user_id: U1, status: "failed", created_at: ago(2), parent_id: null, route: "token", fail_reason: "too_short", decision: null },
      { user_id: U2, status: "failed", created_at: ago(3), parent_id: null, route: "shared", fail_reason: "paywall", decision: null },
      { user_id: U2, status: "rejected", created_at: ago(30), parent_id: null, route: "token", fail_reason: null, decision: "dkim_fail" },
      { user_id: U2, status: "done", created_at: ago(1), parent_id: "x", route: "token", fail_reason: null, decision: null },
      { user_id: U1, status: "done", created_at: ago(24 * 40), parent_id: null, route: "token", fail_reason: null, decision: null },
    ],
    jobs: [
      { stage: "file", status: "queued", attempts: 0, max_attempts: 3, run_after: ago(1), lease_until: null, created_at: ago(2), updated_at: ago(2) },
      { stage: "file", status: "queued", attempts: 1, max_attempts: 3, run_after: new Date(now.getTime() + 3_600_000).toISOString(), lease_until: null, created_at: ago(2), updated_at: ago(2) },
      { stage: "extract", status: "running", attempts: 1, max_attempts: 3, run_after: ago(2), lease_until: ago(0.5), created_at: ago(2), updated_at: ago(1) },
      { stage: "extract", status: "failed", attempts: 3, max_attempts: 3, run_after: ago(5), lease_until: null, created_at: ago(5), updated_at: ago(4) },
      { stage: "cards", status: "done", attempts: 1, max_attempts: 3, run_after: ago(5), lease_until: null, created_at: ago(5), updated_at: ago(0.25) },
    ],
    aiCalls: [
      { at: ago(1), user_id: U1, stage: "extract", model: "m1", status: "ok", cost_usd: "0.20", input_tokens: 10, output_tokens: 5 },
      { at: ago(2), user_id: U1, stage: "cards", model: "m1", status: "invalid_output", cost_usd: 0.15, input_tokens: 10, output_tokens: 5 },
      { at: ago(2), user_id: U2, stage: "cards", model: "m2", status: "ok", cost_usd: null, input_tokens: 1, output_tokens: 1 },
      { at: ago(24 * 20), user_id: U2, stage: "extract", model: "m1", status: "ok", cost_usd: 1, input_tokens: 1, output_tokens: 1 },
    ],
    emails: [
      { kind: "receipt", status: "sent", created_at: ago(1) },
      { kind: "reminder", status: "sent", created_at: ago(2) },
      { kind: "reminder", status: "failed", created_at: ago(2) },
      { kind: "quota", status: "pending", created_at: ago(2) },
      { kind: "receipt", status: "sent", created_at: ago(24 * 40) },
    ],
    reviews: [
      { user_id: U1, reviewed_at: ago(1), rating: 3, duration_ms: 4000 },
      { user_id: U1, reviewed_at: ago(2), rating: 1, duration_ms: 2000 },
    ],
    cards: [
      { user_id: U1, status: "active", created_at: ago(5), kept_at: ago(4) },
      { user_id: U1, status: "discarded", created_at: ago(5), kept_at: null },
      { user_id: U2, status: "proposed", created_at: ago(5), kept_at: null },
    ],
    profiles: [
      { id: U1, created_at: ago(24 * 3), ai_cap_day_usd: "0.30", ai_cap_month_usd: "3.00" },
      { id: U2, created_at: ago(24 * 50), ai_cap_day_usd: "0.30", ai_cap_month_usd: "3.00" },
    ],
    authUsers: [{ last_sign_in_at: ago(2) }, { last_sign_in_at: ago(24 * 3) }, { last_sign_in_at: ago(24 * 30) }, { last_sign_in_at: null }],
    waitlist: [
      { locale: "fr", confirmed_at: ago(5) },
      { locale: "en", confirmed_at: ago(24 * 60) },
    ],
    invites: [
      { max_uses: 10, uses: 4, expires_at: ago(-48), revoked_at: null },
      { max_uses: 5, uses: 0, expires_at: ago(-48), revoked_at: ago(1) },
      { max_uses: 5, uses: 0, expires_at: ago(48), revoked_at: null },
    ],
    ...over,
  };
}

describe("owner report", () => {
  it("[R-ADMIN-01] counts captures by status, failure reason and route, mails only, window only", () => {
    const r = buildOpsReport(input());
    expect(r.captures.total).toBe(4);
    expect(r.captures.byStatus).toEqual({ done: 1, failed: 2, rejected: 1 });
    expect(r.captures.failReasons).toEqual({ too_short: 1, paywall: 1 });
    expect(r.captures.byRoute).toEqual({ token: 3, shared: 1 });
    expect(r.captures.rejectDecisions).toEqual({ dkim_fail: 1 });
    expect(r.captures.byDay.at(-1)?.day).toBe("2026-10-17");
  });

  it("[R-ADMIN-01] reports stuck, lease-expired, retrying and failed jobs; a deferred job is not stuck", () => {
    const r = buildOpsReport(input());
    expect(r.jobs.stuckQueued).toBe(1);
    expect(r.jobs.expiredLease).toBe(1);
    expect(r.jobs.retrying).toBe(1);
    expect(r.jobs.failed).toBe(1);
    expect(r.jobs.oldestQueuedMin).toBe(60);
    expect(r.jobs.byStageState.file).toEqual({ queued: 2 });
    expect(r.health.newestDoneJobAgeMin).toBe(15);
  });

  it("[R-ADMIN-02] sums AI cost per day and stage, month to date against the 50 USD budget, flags unpriced calls", () => {
    const r = buildOpsReport(input());
    expect(AI_BUDGET_MONTH_USD).toBe(50);
    expect(r.ai.monthToDateUsd).toBe(0.35);
    expect(r.ai.budgetPct).toBe(0.7);
    expect(r.ai.windowUsd).toBe(1.35);
    expect(r.ai.unpricedCalls).toBe(1);
    expect(r.ai.byStage.cards).toEqual({ calls: 2, costUsd: 0.15, errors: 1 });
    expect(r.ai.byStage.extract).toEqual({ calls: 2, costUsd: 1.2, errors: 0 });
    expect(r.ai.byDay.find((d) => d.day === "2026-10-17")?.calls).toBe(3);
    expect(r.ai.statusCounts).toEqual({ ok: 3, invalid_output: 1 });
    expect(r.ai.costPerDoneCaptureUsd).toBe(1.35);
  });

  it("[R-ADMIN-02] counts users near their caps without naming them", () => {
    const r = buildOpsReport(input());
    // U1 spent 0.35 in 24 h (117% of 0.30); U2 spent 0 in 24 h and 1.00 in 30 d (33% of 3.00).
    expect(r.ai.caps.users).toBe(2);
    expect(r.ai.caps.day).toEqual({ over50: 1, over80: 1, over100: 1 });
    expect(r.ai.caps.month).toEqual({ over50: 0, over80: 0, over100: 0 });
  });

  it("[R-ADMIN-03] mails: sent per day and month against the Resend limits, labelled as a lower bound", () => {
    const r = buildOpsReport(input());
    expect([RESEND_LIMIT_DAY, RESEND_LIMIT_MONTH]).toEqual([100, 3000]);
    expect(r.mails.lowerBound).toBe(true);
    expect(r.mails.note).toMatch(/at least/i);
    expect(r.mails.sentToday).toBe(2);
    expect(r.mails.sentMonth).toBe(2);
    expect(r.mails.failedMonth).toBe(1);
    expect(r.mails.dayPct).toBe(2);
    expect(r.mails.monthPct).toBe(0.1);
    expect(r.mails.sentByKind).toEqual({ receipt: 1, reminder: 1 });
    expect(r.mails.reminders).toEqual({ sentToday: 1, failedToday: 1 });
  });

  it("[R-ADMIN-04] activity: reviews and reviewers per day, new profiles, last-seen buckets, funnel", () => {
    const r = buildOpsReport(input());
    expect(r.activity.byDay.find((d) => d.day === "2026-10-17")).toEqual({ day: "2026-10-17", reviews: 2, activeReviewers: 1, newProfiles: 0 });
    expect(r.activity.profiles).toBe(2);
    expect(r.activity.newProfilesInWindow).toBe(1);
    expect(r.activity.lastSeenBuckets).toEqual({ today: 1, week: 1, older: 1, never: 1 });
    expect(r.funnel).toEqual({ profiles: 2, withCapture: 2, withActiveCard: 1, withReview: 1 });
  });

  it("[R-ADMIN-05] waitlist is counts only, by language and new in the window", () => {
    const r = buildOpsReport(input());
    expect(r.waitlist).toMatchObject({ total: 2, byLocale: { fr: 1, en: 1 }, newInWindow: 1 });
  });

  it("[R-ADMIN-06] errors of the last 24 h are machine codes with counts; other panels", () => {
    const r = buildOpsReport(input());
    expect(r.errors.last24h).toEqual({
      "capture:too_short": 1,
      "capture:paywall": 1,
      "job:extract:failed": 1,
      "ai:cards:invalid_output": 1,
      "mail:reminder:failed": 1,
    });
    expect(r.errors.total).toBe(5);
    expect(r.invites).toEqual({ activeLinks: 1, usesLeft: 6, nextExpiryInHours: 48 });
    expect(r.cardPipeline.keepRatePct).toBe(50);
    expect(r.reviewQuality).toEqual({ ratings: { "1": 1, "3": 1 }, avgDurationMs: 3000 });
  });

  it("[R-CARD-10] sources with fewer cards than asked: counts and dropped reasons, in the window only", () => {
    const base = input();
    const short = (n: number, kept: number, dropped: Record<string, number>, ageH = 1) => ({ ...base.captures[0]!, created_at: ago(ageH), cards: { requested: n, kept, dropped } });
    const r = buildOpsReport({ ...base, captures: [...base.captures, short(10, 6, { duplicate: 2, yes_no: 1, not_enough_facts: 1 }), short(5, 4, { duplicate: 1 }), short(9, 1, { empty: 8 }, 24 * 60)] });
    expect(r.cardPipeline.shortfalls).toEqual({ captures: 2, requested: 15, kept: 10, droppedByReason: { duplicate: 3, yes_no: 1, not_enough_facts: 1 } });
    expect(buildOpsReport(input()).cardPipeline.shortfalls).toEqual({ captures: 0, requested: 0, kept: 0, droppedByReason: {} });
  });

  it("[R-ADMIN-07] respects the --days window and an empty database", () => {
    expect(buildOpsReport(input({ days: 1 })).captures.total).toBe(3);
    const e = buildOpsReport({ ...input(), captures: [], jobs: [], aiCalls: [], emails: [], reviews: [], cards: [], profiles: [], authUsers: [], waitlist: [], invites: [] });
    expect(e.ai.monthToDateUsd).toBe(0);
    expect(e.mails.sentMonth).toBe(0);
    expect(e.captures.byDay).toHaveLength(30);
    expect(e.health.newestDoneJobAgeMin).toBeNull();
  });

  it("[R-ADMIN-07] privacy: no address, subject, error text or id from the fixtures appears in the report", () => {
    const secrets = ["secret.person@example.com", "Subject: my private diary", "boom: https://private.example/path", "waitlist.person@example.com"];
    // Extra fields a careless fetch could pull in; the report must not copy them.
    const dirty = input();
    const taint = (row: object | undefined, extra: Record<string, string>) => Object.assign(row ?? {}, extra);
    taint(dirty.captures[0], { from_address: secrets[0] ?? "", subject: secrets[1] ?? "" });
    taint(dirty.jobs[3], { error: secrets[2] ?? "" });
    taint(dirty.waitlist[0], { email: secrets[3] ?? "" });
    taint(dirty.emails[0], { to_address: secrets[0] ?? "" });
    const json = JSON.stringify(buildOpsReport(dirty));
    for (const s of secrets) expect(json).not.toContain(s);
    expect(json).not.toMatch(/[^\s"@]+@[^\s"@]+\.[a-z]{2,}/i);
    expect(json).not.toContain(U1);
    expect(json).not.toContain(U2);
    for (const k of ["email", "subject", "from_address", "to_address", "error", "user_id"]) expect(json).not.toContain(`"${k}"`);
  });
});
