import { describe, expect, it } from "vitest";
import { validateSettings } from "@/domain/settings";

const good = {
  daily_minutes: "10",
  study_days: ["1", "2", "3", "4", "5"],
  max_new_cards: "5",
  desired_retention: "0.90",
  timezone: "Europe/Paris",
  language: "fr",
};
const errorsOf = (over: Record<string, unknown>) => {
  const r = validateSettings({ ...good, ...over });
  return r.ok ? [] : r.errors;
};

describe("[R-ACC-05] budget settings are validated on the server", () => {
  it("accepts a valid form and normalises it", () => {
    const r = validateSettings({ ...good, study_days: ["5", "1", "1"] });
    expect(r).toEqual({
      ok: true,
      value: { daily_minutes: 10, study_days: [1, 5], max_new_cards: 5, desired_retention: 0.9, timezone: "Europe/Paris", language: "fr" },
    });
  });
  it("daily minutes must be one of 3, 6, 10, 15, 20", () => {
    for (const m of ["3", "6", "10", "15", "20"]) expect(errorsOf({ daily_minutes: m })).toEqual([]);
    for (const m of ["0", "5", "12", "25", "-10", "abc", "", "10.5", null, 10]) expect(errorsOf({ daily_minutes: m })).toEqual(["daily_minutes"]);
  });
  it("study days: at least one, only 0 to 6", () => {
    expect(errorsOf({ study_days: [] })).toEqual(["study_days"]);
    expect(errorsOf({ study_days: ["7"] })).toEqual(["study_days"]);
    expect(errorsOf({ study_days: ["1", "x"] })).toEqual(["study_days"]);
    expect(errorsOf({ study_days: "1" })).toEqual(["study_days"]);
    expect(errorsOf({ study_days: ["0", "6"] })).toEqual([]);
  });
  it("max new cards: whole number from 0 to 20", () => {
    expect(errorsOf({ max_new_cards: "0" })).toEqual([]);
    expect(errorsOf({ max_new_cards: "20" })).toEqual([]);
    for (const n of ["21", "-1", "2.5", "", "abc"]) expect(errorsOf({ max_new_cards: n })).toEqual(["max_new_cards"]);
  });
  it("timezone must be a known IANA name", () => {
    expect(errorsOf({ timezone: "America/Los_Angeles" })).toEqual([]);
    for (const tz of ["Mars/Olympus", "", "   ", "x".repeat(80)]) expect(errorsOf({ timezone: tz })).toEqual(["timezone"]);
  });
  it("language is fr or en", () => {
    expect(errorsOf({ language: "en" })).toEqual([]);
    expect(errorsOf({ language: "de" })).toEqual(["language"]);
  });
  it("reports every wrong field, and a rejected form yields no value", () => {
    const r = validateSettings({ ...good, daily_minutes: "7", max_new_cards: "99" });
    expect(r).toEqual({ ok: false, errors: ["daily_minutes", "max_new_cards"] });
  });
});

describe("[R-ACC-06] desired retention stays within [0.80, 0.95]", () => {
  it("accepts the bounds and values between, with a comma or a dot", () => {
    for (const v of ["0.80", "0.8", "0.9", "0.95", "0,85"]) expect(errorsOf({ desired_retention: v })).toEqual([]);
  });
  it("rejects values outside the range or malformed", () => {
    for (const v of ["0.79", "0.96", "1", "0", "1.5", "-0.9", "abc", "", "0.9.1", "90"]) expect(errorsOf({ desired_retention: v })).toEqual(["desired_retention"]);
  });
});
