import { describe, expect, it } from "vitest";
import { openWaitlistToken, sealWaitlistToken } from "./waitlist-token";

const SECRET = "test-secret-value";
const EMAIL = "reader@example.test";
const NOW = 1_800_000_000;

describe("[R-LAND-04] sealed waitlist tokens", () => {
  it("round trip for both purposes and both locales", () => {
    for (const purpose of ["confirm", "leave"] as const) {
      for (const locale of ["fr", "en"] as const) {
        const t = sealWaitlistToken(purpose, EMAIL, locale, SECRET, 100, NOW);
        expect(openWaitlistToken(purpose, t, SECRET, NOW + 50)).toEqual({ email: EMAIL, locale });
      }
    }
  });

  it("an expired token opens as null", () => {
    const t = sealWaitlistToken("confirm", EMAIL, "fr", SECRET, 100, NOW);
    expect(openWaitlistToken("confirm", t, SECRET, NOW + 101)).toBeNull();
    expect(openWaitlistToken("confirm", t, SECRET, NOW + 100)).not.toBeNull();
  });

  it("the purpose is bound: a leave token is not a confirm token and the reverse", () => {
    const leave = sealWaitlistToken("leave", EMAIL, "fr", SECRET, 100, NOW);
    const confirm = sealWaitlistToken("confirm", EMAIL, "fr", SECRET, 100, NOW);
    expect(openWaitlistToken("confirm", leave, SECRET, NOW)).toBeNull();
    expect(openWaitlistToken("leave", confirm, SECRET, NOW)).toBeNull();
  });

  it("another secret, an unset secret and an empty secret give null", () => {
    const t = sealWaitlistToken("confirm", EMAIL, "fr", SECRET, 100, NOW);
    expect(openWaitlistToken("confirm", t, "other", NOW)).toBeNull();
    expect(openWaitlistToken("confirm", t, undefined, NOW)).toBeNull();
    expect(openWaitlistToken("confirm", t, "", NOW)).toBeNull();
    expect(() => sealWaitlistToken("confirm", EMAIL, "fr", undefined, 100, NOW)).toThrow();
    expect(() => sealWaitlistToken("confirm", EMAIL, "fr", "", 100, NOW)).toThrow();
  });

  it("a tampered or malformed token gives null", () => {
    const t = sealWaitlistToken("confirm", EMAIL, "fr", SECRET, 100, NOW);
    const mid = Math.floor(t.length / 2);
    const flipped = t.slice(0, mid) + (t[mid] === "A" ? "B" : "A") + t.slice(mid + 1);
    expect(openWaitlistToken("confirm", flipped, SECRET, NOW)).toBeNull();
    for (const bad of ["", "a.b", "x".repeat(2000), 42, undefined, null, {}]) expect(openWaitlistToken("confirm", bad, SECRET, NOW)).toBeNull();
  });

  it("the token does not contain the address or its base64", () => {
    const t = sealWaitlistToken("confirm", EMAIL, "fr", SECRET, 100, NOW);
    expect(t).not.toContain(EMAIL);
    expect(t).not.toContain(Buffer.from(EMAIL).toString("base64url"));
    expect(t).not.toContain(Buffer.from(EMAIL).toString("base64"));
  });

  it("two seals of the same input differ", () => {
    expect(sealWaitlistToken("confirm", EMAIL, "fr", SECRET, 100, NOW)).not.toBe(sealWaitlistToken("confirm", EMAIL, "fr", SECRET, 100, NOW));
  });

  it("a payload with an invalid address opens as null", () => {
    const t = sealWaitlistToken("confirm", "not-an-address", "fr", SECRET, 100, NOW);
    expect(openWaitlistToken("confirm", t, SECRET, NOW)).toBeNull();
  });
});

describe("[R-LAND-07] leave tokens", () => {
  it("a leave token round-trips and carries the address and language", () => {
    const t = sealWaitlistToken("leave", EMAIL, "en", SECRET, 2 * 365 * 86_400, NOW);
    expect(openWaitlistToken("leave", t, SECRET, NOW + 365 * 86_400)).toEqual({ email: EMAIL, locale: "en" });
  });
});
