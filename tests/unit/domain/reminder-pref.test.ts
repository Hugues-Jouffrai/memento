import { describe, expect, it } from "vitest";
import { currentChoice, isReminderChoice, prefFor, reminderUpdate, remindersAllowed } from "@/domain/reminder-pref";

const now = new Date("2026-10-16T12:00:00Z");

describe("reminder preference", () => {
  it("[R-NOT-04] each choice sets the right columns", () => {
    expect(prefFor("on", now)).toEqual({ reminders_off: false, reminders_paused_until: null });
    expect(prefFor("off", now)).toEqual({ reminders_off: true, reminders_paused_until: null });
    expect(prefFor("week", now)).toEqual({ reminders_off: false, reminders_paused_until: "2026-10-23T12:00:00.000Z" });
    expect(prefFor("month", now)).toEqual({ reminders_off: false, reminders_paused_until: "2026-11-15T12:00:00.000Z" });
  });
  it("[R-NOT-04] reminders are allowed only when on and not paused", () => {
    expect(remindersAllowed(prefFor("on", now), now)).toBe(true);
    expect(remindersAllowed(prefFor("off", now), now)).toBe(false);
    expect(remindersAllowed(prefFor("week", now), now)).toBe(false);
    expect(remindersAllowed(prefFor("week", now), new Date(now.getTime() + 7 * 86_400_000 + 1))).toBe(true);
  });
  it("[R-NOT-04] the settings form shows the matching choice, and an ended pause shows 'on'", () => {
    for (const c of ["on", "week", "month", "off"] as const) expect(currentChoice(prefFor(c, now), now)).toBe(c);
    expect(currentChoice(prefFor("week", now), new Date(now.getTime() + 8 * 86_400_000))).toBe("on");
  });
  it("[R-NOT-04] only the four known choices are accepted", () => {
    for (const bad of ["", "forever", "OFF", null, undefined, 1]) expect(isReminderChoice(bad)).toBe(false);
  });
});

describe("[R-ACC-08] saving the settings form and reminders", () => {
  it("applies the chosen option only when it differs from the one in force", () => {
    expect(reminderUpdate("week", "on", now)).toEqual(prefFor("week", now));
    expect(reminderUpdate("off", "month", now)).toEqual(prefFor("off", now));
    expect(reminderUpdate("on", "week", now)).toEqual({ reminders_off: false, reminders_paused_until: null });
  });
  it("leaves a running pause alone when other settings are saved", () => {
    for (const c of ["on", "week", "month", "off"] as const) expect(reminderUpdate(c, c, now)).toBeNull();
  });
});
