import { describe, expect, it } from "vitest";
import {
  NEW_CARD_FIRST_DAY_REVIEWS,
  applyReview,
  newCardAllowance,
  newCardState,
  type CardState,
  type Grade,
} from "@/domain/scheduling";
import { isStudyDay } from "@/domain/time";

const DAY_MS = 86_400_000;
const dueMs = (c: CardState) => Date.parse(c.due);

/** Small deterministic generator so the simulation is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimOptions {
  days: number;
  dailyMinutes: number;
  maxNewCards: number;
  secondsPerReview: number;
  studyDays: number[];
  retention?: number;
  /** Hugues keeps this many more cards than the allowance would introduce: the pool never runs dry. */
  seed?: number;
}

interface DayResult {
  studied: boolean;
  /** Planned load in seconds when the session opens: due reviews + first-day cost of the new cards. */
  plannedSec: number;
  spentSec: number;
  introduced: number;
  /** Cards overdue (due before the day started) when the day opens. */
  overdueAtOpen: number;
  stoppedByBudget: boolean;
}

/** Runs a user with the app's own allowance rule and budget stop (R-SCH-04, R-SCH-05, R-SCH-06). */
function simulate(o: SimOptions): DayResult[] {
  const rand = rng(o.seed ?? 1);
  const retention = o.retention ?? 0.9;
  const t0 = Date.UTC(2026, 0, 5); // a Monday, 00:00 UTC
  const cards: CardState[] = [];
  const results: DayResult[] = [];
  const budgetSec = o.dailyMinutes * 60;

  for (let day = 0; day < o.days; day++) {
    const dayStart = t0 + day * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    const studied = isStudyDay(new Date(dayStart), "UTC", o.studyDays);
    const overdueAtOpen = cards.filter((c) => new Date(c.due).getTime() < dayStart).length;
    if (!studied) {
      results.push({ studied, plannedSec: 0, spentSec: 0, introduced: 0, overdueAtOpen, stoppedByBudget: false });
      continue;
    }
    let now = dayStart + 18 * 3_600_000; // the 18:00 session
    const due = () => cards.filter((c) => dueMs(c) <= dayEnd).length;
    const dueAtOpen = due();
    const allowance = newCardAllowance({
      maxNewCards: o.maxNewCards,
      dailyMinutes: o.dailyMinutes,
      dueReviews: dueAtOpen,
      introducedToday: 0,
      secondsPerReview: o.secondsPerReview,
      secondsSpentToday: 0,
      studyDay: true,
    });
    const plannedSec = (dueAtOpen + allowance * NEW_CARD_FIRST_DAY_REVIEWS) * o.secondsPerReview;
    let toIntroduce = allowance;
    let spent = 0;
    let stopped = false;

    for (;;) {
      if (spent >= budgetSec) {
        // The budget stop only counts when work was left undone.
        stopped = toIntroduce > 0 || cards.some((c) => dueMs(c) <= dayEnd);
        break;
      }
      // Due cards first (oldest due), then a new card while the allowance lasts.
      let pending: CardState | undefined;
      for (const c of cards) if (dueMs(c) <= dayEnd && (!pending || dueMs(c) < dueMs(pending))) pending = c;
      let card: CardState;
      let isNew = false;
      if (pending) {
        card = pending;
        now = Math.max(now, dueMs(pending)); // waiting for a learning step is not review time
      } else if (toIntroduce > 0) {
        card = newCardState(new Date(now));
        isNew = true;
        toIntroduce--;
      } else break;
      const p = isNew || card.state !== 2 ? 0.85 : retention;
      const r = rand();
      const grade: Grade = r > p ? 1 : (([3, 3, 3, 3, 3, 3, 3, 2, 2, 4][Math.floor(rand() * 10)] ?? 3) as Grade);
      const idx = cards.indexOf(card);
      const next = applyReview(card, grade, new Date(now), retention);
      if (idx >= 0) cards[idx] = next;
      else cards.push(next);
      spent += o.secondsPerReview;
      now += o.secondsPerReview * 1000;
    }
    results.push({ studied, plannedSec, spentSec: spent, introduced: allowance - toIntroduce, overdueAtOpen, stoppedByBudget: stopped });
  }
  return results;
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

describe("[R-SCH-04][R-SCH-06] 180-day simulation stays within budget (M4 exit test)", () => {
  for (const c of [
    { name: "10 min, 5 new/day, 10 s per review, every day", dailyMinutes: 10, maxNewCards: 5, secondsPerReview: 10, studyDays: EVERY_DAY },
    { name: "6 min, 10 new/day, 8 s per review, every day", dailyMinutes: 6, maxNewCards: 10, secondsPerReview: 8, studyDays: EVERY_DAY },
    { name: "3 min, 5 new/day, 15 s per review, every day", dailyMinutes: 3, maxNewCards: 5, secondsPerReview: 15, studyDays: EVERY_DAY },
    { name: "10 min, 5 new/day, 10 s per review, 5 days a week", dailyMinutes: 10, maxNewCards: 5, secondsPerReview: 10, studyDays: WEEKDAYS },
    { name: "20 min, 20 new/day, 6 s per review, 5 days a week", dailyMinutes: 20, maxNewCards: 20, secondsPerReview: 6, studyDays: WEEKDAYS },
  ]) {
    it(c.name, { timeout: 30_000 }, () => {
      const days = simulate({ days: 180, ...c });
      if (process.env.SIM_DEBUG) console.log(c.name, { stops: days.filter((d) => d.stoppedByBudget).length, maxOverdue: Math.max(...days.map((d) => d.overdueAtOpen)), last: days.slice(-3), intro: days.reduce((n, d) => n + d.introduced, 0) });
      const budgetSec = c.dailyMinutes * 60;
      const studied = days.filter((d) => d.studied);
      // The plan never promises more than the budget (the allowance only shrinks, due reviews are not ours to cut).
      // Backlog after off days is allowed to exceed it by the R-SCH-05 tolerance of 50%.
      for (const d of studied) {
        expect(d.spentSec).toBeLessThanOrEqual(budgetSec + c.secondsPerReview);
        expect(d.plannedSec).toBeLessThanOrEqual(budgetSec * 1.5);
      }
      // The budget stop is rare: the allowance leaves room for the reviews it creates.
      expect(studied.filter((d) => d.stoppedByBudget).length).toBeLessThanOrEqual(studied.length * 0.15);
      // No avalanche: the backlog is bounded and gone at the end.
      const maxOverdue = Math.max(...days.map((d) => d.overdueAtOpen));
      expect(maxOverdue).toBeLessThanOrEqual((budgetSec / c.secondsPerReview) * 1.5);
      // The last fortnight is no worse than the rest: the backlog does not keep growing.
      expect(Math.max(...days.slice(-14).map((d) => d.overdueAtOpen))).toBeLessThanOrEqual(budgetSec / c.secondsPerReview);
      // The collection really grows (the test would pass trivially if nothing were introduced).
      expect(days.reduce((n, d) => n + d.introduced, 0)).toBeGreaterThan(100);
    });
  }

  it("[R-SCH-05] after two off days the first study day stays within 150% of the budget", () => {
    const days = simulate({ days: 180, dailyMinutes: 10, maxNewCards: 5, secondsPerReview: 10, studyDays: [1, 2, 3, 4, 5] });
    const mondays = days.filter((d, i) => d.studied && i % 7 === 0 && i > 14);
    expect(mondays.length).toBeGreaterThan(20);
    for (const d of mondays) expect(d.plannedSec).toBeLessThanOrEqual(600 * 1.5);
  });
});
