import { describe, expect, it } from "vitest";
import { AI_STAGES, CAP_RECHECK_MS, capStatus, holdUntil } from "@/domain/cost-cap";

const caps = { dayUsd: 0.3, monthUsd: 3 };

describe("per-user cost cap", () => {
  it("[D53] under both limits nothing is held", () => {
    expect(capStatus({ dayUsd: 0.29, monthUsd: 2.99 }, caps)).toEqual({ held: false });
  });
  it("[D53] reaching the day limit holds, reaching it exactly included", () => {
    expect(capStatus({ dayUsd: 0.3, monthUsd: 1 }, caps)).toEqual({ held: true, window: "day" });
  });
  it("[D53] the month limit wins when both are reached", () => {
    expect(capStatus({ dayUsd: 5, monthUsd: 3 }, caps)).toEqual({ held: true, window: "month" });
  });
  it("[D53] a cap of zero holds everything", () => {
    expect(capStatus({ dayUsd: 0, monthUsd: 0 }, { dayUsd: 0, monthUsd: 3 })).toEqual({ held: true, window: "day" });
  });
  it("[D53] only the stages that call the AI are held", () => {
    expect([...AI_STAGES].sort()).toEqual(["cards", "extract", "file"]);
    for (const s of ["fetch", "page", "receipt", "reminder"]) expect(AI_STAGES.has(s)).toBe(false);
  });
  it("[D53] a held job is looked at again an hour later", () => {
    expect(holdUntil(new Date("2026-10-16T10:00:00Z")).getTime() - new Date("2026-10-16T10:00:00Z").getTime()).toBe(CAP_RECHECK_MS);
  });
});
