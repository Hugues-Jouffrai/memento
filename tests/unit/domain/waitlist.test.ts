import { describe, expect, it } from "vitest";
import {
  WAITLIST_CONFIRM_TTL_SECONDS,
  WAITLIST_EMAIL_WINDOW_SECONDS,
  WAITLIST_GLOBAL_WINDOW_SECONDS,
  WAITLIST_IP_WINDOW_SECONDS,
  WAITLIST_LEAVE_TTL_SECONDS,
  WAITLIST_LIMIT_GLOBAL,
  WAITLIST_LIMIT_PER_EMAIL,
  WAITLIST_LIMIT_PER_IP,
  WAITLIST_RETENTION_MONTHS,
  isNotifyState,
  waitlistCsv,
  waitlistRateKeys,
} from "@/domain/waitlist";

describe("notify-me list rules", () => {
  it("[R-LAND-03] the four result states are known, anything else is not", () => {
    for (const s of ["sent", "invalid", "limited", "failed"]) expect(isNotifyState(s)).toBe(true);
    for (const v of ["x", undefined, ["sent"], null, 3]) expect(isNotifyState(v)).toBe(false);
  });

  it("[R-LAND-06] rate keys carry the hashes given and never an address", () => {
    const k = waitlistRateKeys("ab", "cd");
    expect(k).toEqual({ email: "waitlist:email:ab", ip: "waitlist:ip:cd", all: "waitlist:all" });
    for (const v of Object.values(k)) expect(v).not.toContain("@");
  });

  it("[R-LAND-06] the limits are positive whole numbers", () => {
    for (const n of [
      WAITLIST_LIMIT_PER_EMAIL,
      WAITLIST_LIMIT_PER_IP,
      WAITLIST_LIMIT_GLOBAL,
      WAITLIST_EMAIL_WINDOW_SECONDS,
      WAITLIST_IP_WINDOW_SECONDS,
      WAITLIST_GLOBAL_WINDOW_SECONDS,
      WAITLIST_CONFIRM_TTL_SECONDS,
    ])
      expect(Number.isInteger(n) && n > 0).toBe(true);
  });

  it("[R-LAND-07] a leave link outlives the retention", () => {
    expect(WAITLIST_LEAVE_TTL_SECONDS).toBeGreaterThan(WAITLIST_RETENTION_MONTHS * 31 * 86_400);
  });

  it("[R-LAND-08] the CSV has a header, quotes commas and defuses formulas", () => {
    const csv = waitlistCsv([
      { email: "a@example.test", locale: "fr", confirmed_at: "2026-10-16T10:00:00Z" },
      { email: "=cmd@example.test", locale: "en", confirmed_at: "x,y" },
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("email,locale,confirmed_at");
    expect(lines[1]).toBe("a@example.test,fr,2026-10-16T10:00:00Z");
    expect(lines[2]).toBe("'=cmd@example.test,en,\"x,y\"");
  });
});
