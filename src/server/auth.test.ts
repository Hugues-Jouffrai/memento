import { describe, expect, it } from "vitest";
import { parseCode, parseEmail, parseRetrySeconds, safeNext } from "./auth";

describe("[R-ACC-10] resend wait parsed from Auth's rate-limit message", () => {
  it("reads the number of seconds", () => {
    expect(parseRetrySeconds("For security purposes, you can only request this after 48 seconds.")).toBe(48);
    expect(parseRetrySeconds("after 1 second")).toBe(1);
  });
  it("falls back to 60 without a usable number", () => {
    for (const bad of ["Too many requests", "", null, undefined, "after 0 seconds", "after 99999 seconds"]) expect(parseRetrySeconds(bad)).toBe(60);
  });
});

describe("[R-ACC-01] sign-in input parsing", () => {
  it("accepts a 6-digit code, with or without spaces", () => {
    expect(parseCode("123456")).toBe("123456");
    expect(parseCode(" 123 456 ")).toBe("123456");
  });
  it("rejects codes that are not exactly 6 digits", () => {
    for (const bad of ["12345", "1234567", "12345a", "", null, 123456]) expect(parseCode(bad)).toBeNull();
  });
  it("normalises emails and rejects junk", () => {
    expect(parseEmail("  Hugues@Example.COM ")).toBe("hugues@example.com");
    for (const bad of ["nope", "a@b", "", null, "a b@c.d"]) expect(parseEmail(bad)).toBeNull();
  });
  it("only allows same-site relative redirects", () => {
    expect(safeNext("/review?x=1")).toBe("/review?x=1");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", undefined]) expect(safeNext(bad)).toBe("/");
  });
});
