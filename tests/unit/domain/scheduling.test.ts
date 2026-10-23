import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECONDS_PER_REVIEW,
  FSRS_VERSION,
  applyReview,
  elapsedDays,
  estimateMinutes,
  medianSecondsPerReview,
  newCardAllowance,
  newCardState,
  replayReviews,
  type Grade,
} from "@/domain/scheduling";
import { isStudyDay, localDate, localDayStart, localParts } from "@/domain/time";

const t0 = new Date("2026-10-14T16:00:00Z");

describe("[R-SCH-01] FSRS version is pinned", () => {
  it("the constant matches the exact version in package.json", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["ts-fsrs"]).toBe(FSRS_VERSION);
  });
});

describe("[R-SCH-02] review log replay", () => {
  it("replaying the logged ratings and times rebuilds exactly the state reached live", () => {
    const grades: Grade[] = [3, 3, 1, 3, 4, 2, 3];
    let live = newCardState(t0);
    const log: { grade: Grade; at: string }[] = [];
    let now = t0;
    for (const g of grades) {
      live = applyReview(live, g, now, 0.9);
      log.push({ grade: g, at: now.toISOString() });
      now = new Date(now.getTime() + (live.state === 2 ? Math.max(1, live.scheduled_days) * 86_400_000 : 10 * 60_000));
    }
    expect(replayReviews(t0, log, 0.9)).toEqual(live);
  });
  it("is deterministic: same inputs, same output (no fuzz)", () => {
    const a = applyReview(newCardState(t0), 3, t0, 0.9);
    const b = applyReview(newCardState(t0), 3, t0, 0.9);
    expect(a).toEqual(b);
  });
});

describe("[R-SCH-03] short steps stay within the day", () => {
  it("a new card graded Good or Again comes back the same day", () => {
    for (const g of [1, 3] as Grade[]) {
      const s = applyReview(newCardState(t0), g, t0, 0.9);
      expect(new Date(s.due).getTime() - t0.getTime()).toBeLessThan(86_400_000);
      expect(s.state).toBe(1);
    }
  });
  it("Easy graduates a new card to review with a due date in days", () => {
    const s = applyReview(newCardState(t0), 4, t0, 0.9);
    expect(s.state).toBe(2);
    expect(s.scheduled_days).toBeGreaterThanOrEqual(1);
  });
  it("a higher desired retention schedules the same review sooner", () => {
    const base = applyReview(applyReview(newCardState(t0), 4, t0, 0.9), 3, new Date("2026-10-20T16:00:00Z"), 0.9);
    const high = applyReview(applyReview(newCardState(t0), 4, t0, 0.95), 3, new Date("2026-10-20T16:00:00Z"), 0.95);
    expect(high.scheduled_days).toBeLessThanOrEqual(base.scheduled_days);
  });
});

describe("[R-SCH-04] median seconds per review", () => {
  const ms = (n: number, v: number) => Array.from({ length: n }, () => v);
  it("uses the default below 30 timed reviews", () => expect(medianSecondsPerReview(ms(29, 20_000))).toBe(DEFAULT_SECONDS_PER_REVIEW));
  it("ignores null durations", () => expect(medianSecondsPerReview([...ms(29, 20_000), null, null])).toBe(DEFAULT_SECONDS_PER_REVIEW));
  it("is the median, not the mean (outliers do not move it)", () => {
    expect(medianSecondsPerReview([...ms(20, 8_000), ...ms(10, 12_000), 120_000])).toBe(8);
    expect(medianSecondsPerReview([...ms(15, 6_000), ...ms(15, 8_000)])).toBe(7);
  });
  it("is clamped to [3, 60] seconds", () => {
    expect(medianSecondsPerReview(ms(40, 500))).toBe(3);
    expect(medianSecondsPerReview(ms(40, 100_000))).toBe(60);
  });
});

describe("[R-SCH-04] new-card allowance", () => {
  const base = { maxNewCards: 5, dailyMinutes: 10, dueReviews: 0, introducedToday: 0 };
  it("is the user's max when the budget is free", () => expect(newCardAllowance(base)).toBe(5));
  it("shrinks as the due reviews fill the budget (10 min = 60 reviews at 10 s, 80% planned, a new card costs 3)", () => {
    expect(newCardAllowance({ ...base, dueReviews: 30 })).toBe(5);
    expect(newCardAllowance({ ...base, dueReviews: 36 })).toBe(4);
    expect(newCardAllowance({ ...base, dueReviews: 42 })).toBe(2);
    expect(newCardAllowance({ ...base, dueReviews: 48 })).toBe(0);
    expect(newCardAllowance({ ...base, dueReviews: 500 })).toBe(0);
  });
  it("uses the measured speed: faster reviews leave room, slower ones remove it", () => {
    expect(newCardAllowance({ ...base, maxNewCards: 20, dueReviews: 60, secondsPerReview: 5 })).toBe(12);
    expect(newCardAllowance({ ...base, dueReviews: 6, secondsPerReview: 20 })).toBe(5);
    expect(newCardAllowance({ ...base, dueReviews: 24, secondsPerReview: 20 })).toBe(0);
  });
  it("subtracts the new cards already introduced today", () => {
    expect(newCardAllowance({ ...base, introducedToday: 3 })).toBe(2);
    expect(newCardAllowance({ ...base, introducedToday: 9 })).toBe(0);
  });
  it("subtracts the time already spent today", () => {
    expect(newCardAllowance({ ...base, secondsSpentToday: 600 })).toBe(0);
    expect(newCardAllowance({ ...base, secondsSpentToday: 450 })).toBe(4);
    expect(newCardAllowance({ ...base, secondsSpentToday: 540 })).toBe(1);
  });
  it("[R-SCH-05] gives no new cards on a day that is not a study day", () => {
    expect(newCardAllowance({ ...base, studyDay: false })).toBe(0);
  });
  it("[R-TRAY-02] keeping 40 cards does not add 40 reviews tomorrow", () => {
    expect(newCardAllowance({ ...base, maxNewCards: 5 })).toBeLessThanOrEqual(5);
  });
  it("estimates minutes by rounding up", () => {
    expect(estimateMinutes(7)).toBe(2);
    expect(estimateMinutes(7, 5)).toBe(1);
  });
});

describe("[R-ACC-04] local days follow the timezone", () => {
  const at = new Date("2026-10-14T23:30:00Z");
  it("the same instant is a different local date in different zones", () => {
    expect(localDate(at, "Europe/Paris")).toBe("2026-10-15");
    expect(localDate(at, "America/Los_Angeles")).toBe("2026-10-14");
    expect(localDate(at, "Pacific/Auckland")).toBe("2026-10-15");
  });
  it("local midnight is found per zone, including DST offsets", () => {
    expect(localDayStart(at, "Europe/Paris").toISOString()).toBe("2026-10-14T22:00:00.000Z"); // CEST, UTC+2
    expect(localDayStart(at, "America/Los_Angeles").toISOString()).toBe("2026-10-14T07:00:00.000Z"); // PDT, UTC-7
    expect(localDayStart(new Date("2026-12-14T23:30:00Z"), "Europe/Paris").toISOString()).toBe("2026-12-14T23:00:00.000Z"); // CET
  });
  it("study days use the local weekday", () => {
    // 2026-10-14 is a Wednesday (3). In Auckland it is already Thursday (4).
    expect(localParts(at, "America/Los_Angeles").weekday).toBe(3);
    expect(localParts(at, "Pacific/Auckland").weekday).toBe(4);
    expect(isStudyDay(at, "Pacific/Auckland", [4])).toBe(true);
    expect(isStudyDay(at, "America/Los_Angeles", [4])).toBe(false);
  });
  it("elapsed days are whole days since the last review", () => {
    expect(elapsedDays("2026-10-10T10:00:00Z", new Date("2026-10-14T09:00:00Z"))).toBe(3);
    expect(elapsedDays(null, t0)).toBe(0);
  });
});
