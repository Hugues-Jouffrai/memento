import { describe, expect, it } from "vitest";
import { applyReview, formatInterval, intervalParts, newCardState, previewIntervals, type Grade } from "@/domain/scheduling";

const NOW = new Date("2026-10-17T10:00:00Z");
const MIN = 60_000;
const DAY = 86_400_000;

describe("[R-SCH-07] interval preview", () => {
  const states = () => {
    const fresh = newCardState(NOW);
    const learning = applyReview(fresh, 3, NOW, 0.9);
    const review = applyReview(learning, 3, new Date(learning.due), 0.9);
    const relearning = applyReview(review, 1, new Date(review.due), 0.9);
    return { fresh, learning, review, relearning };
  };

  it("equals what applyReview stores, for every grade, on new, learning, review and relearning cards", () => {
    for (const [name, st] of Object.entries(states())) {
      const now = new Date(st.state === 0 ? NOW : st.due);
      const preview = previewIntervals(st, now, 0.9);
      for (const g of [1, 2, 3, 4] as Grade[]) {
        const due = new Date(applyReview(st, g, now, 0.9).due).getTime();
        expect([name, g, preview[g]]).toEqual([name, g, due - now.getTime()]);
      }
    }
  });

  it("never decreases from À revoir to Facile", () => {
    for (const st of Object.values(states())) {
      const now = new Date(st.state === 0 ? NOW : st.due);
      const p = previewIntervals(st, now, 0.9);
      expect(p[1]).toBeLessThanOrEqual(p[2]);
      expect(p[2]).toBeLessThanOrEqual(p[3]);
      expect(p[3]).toBeLessThanOrEqual(p[4]);
    }
  });

  it("a forgotten card comes back within the day (short steps), never after weeks", () => {
    const { review } = states();
    expect(previewIntervals(review, new Date(review.due), 0.9)[1]).toBeLessThan(DAY);
  });

  it("picks the unit at the boundaries", () => {
    expect(intervalParts(30_000)).toEqual({ unit: "minute", value: 1 });
    expect(intervalParts(10 * MIN)).toEqual({ unit: "minute", value: 10 });
    expect(intervalParts(59 * MIN)).toEqual({ unit: "minute", value: 59 });
    expect(intervalParts(60 * MIN)).toEqual({ unit: "hour", value: 1 });
    expect(intervalParts(23 * 60 * MIN)).toEqual({ unit: "hour", value: 23 });
    expect(intervalParts(DAY)).toEqual({ unit: "day", value: 1 });
    expect(intervalParts(30 * DAY)).toEqual({ unit: "day", value: 30 });
    expect(intervalParts(60 * DAY)).toEqual({ unit: "month", value: 2 });
    expect(intervalParts(400 * DAY)).toEqual({ unit: "year", value: 1.1 });
  });

  it("formats in French and English, short and long (a no-break space joins number and unit)", () => {
    const n = (x: string) => x.replace(/\s/g, " ");
    expect(n(formatInterval(10 * MIN, "fr"))).toBe("10 min");
    expect(n(formatInterval(4 * DAY, "fr"))).toBe("4 j");
    expect(n(formatInterval(2 * 31 * DAY, "fr"))).toBe("2 mois");
    expect(n(formatInterval(4 * DAY, "fr", "long"))).toBe("dans 4 jours");
    expect(n(formatInterval(4 * DAY, "en", "long"))).toBe("in 4 days");
    expect(n(formatInterval(10 * MIN, "en"))).toMatch(/^10 ?min/);
    expect(n(formatInterval(4 * DAY, "en"))).toMatch(/^4 ?(d|days)/);
  });
});
