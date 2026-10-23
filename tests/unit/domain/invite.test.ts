import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_INVITE_DAYS, DEFAULT_INVITE_MAX_USES, INVITE_CODE_BYTES, inviteExpiry, isInviteCode, parseInviteArgs } from "@/domain/invite";
import { hashSecret, newInviteCode } from "@/server/join";

describe("invite code", () => {
  it("[R-ACC-02] a generated code has 160 bits and passes the shape check", () => {
    const code = newInviteCode();
    expect(code).toHaveLength(27);
    expect(Buffer.from(code, "base64url")).toHaveLength(INVITE_CODE_BYTES);
    expect(isInviteCode(code)).toBe(true);
  });
  it("[R-ACC-02] two codes differ", () => {
    expect(newInviteCode()).not.toBe(newInviteCode());
  });
  it("[R-ACC-02] anything that is not a 27-character code is refused before the database", () => {
    for (const bad of ["", "short", "a".repeat(26), "a".repeat(28), "a".repeat(26) + "!", "a".repeat(26) + " ", null, undefined, 42]) expect(isInviteCode(bad)).toBe(false);
    expect(isInviteCode(randomBytes(20).toString("base64url"))).toBe(true);
  });
  it("[R-ACC-02] the stored form is a SHA-256 hex digest, not the code", () => {
    const code = newInviteCode();
    expect(hashSecret(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret(code)).not.toContain(code);
    expect(hashSecret(code)).toBe(hashSecret(code));
  });
});

describe("invite defaults", () => {
  it("[R-ACC-02] defaults are 30 sign-ups and 30 days", () => {
    const r = parseInviteArgs([]);
    expect(r).toEqual({ ok: true, value: { maxUses: DEFAULT_INVITE_MAX_USES, days: DEFAULT_INVITE_DAYS }, label: null });
    expect(DEFAULT_INVITE_MAX_USES).toBe(30);
    expect(DEFAULT_INVITE_DAYS).toBe(30);
  });
  it("[R-ACC-02] flags override the defaults", () => {
    expect(parseInviteArgs(["--label", " beta1 ", "--max", "5", "--days", "7"])).toEqual({ ok: true, value: { maxUses: 5, days: 7 }, label: "beta1" });
  });
  it("[R-ACC-02] zero, negative, fractional or unknown arguments are refused", () => {
    for (const args of [["--max", "0"], ["--max", "-3"], ["--days", "1.5"], ["--max"], ["--label", " "], ["--nope"]]) expect(parseInviteArgs(args).ok).toBe(false);
  });
  it("[R-ACC-02] expiry is a whole number of days ahead", () => {
    expect(inviteExpiry(new Date("2026-10-16T12:00:00Z"), 30).toISOString()).toBe("2026-11-15T12:00:00.000Z");
  });
});
