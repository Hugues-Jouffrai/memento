import { describe, expect, it } from "vitest";
import { REVIEW_TOKEN_TTL_SECONDS, UNSUBSCRIBE_TOKEN_TTL_SECONDS, createReviewToken, createUnsubscribeToken, verifyReviewToken, verifyUnsubscribeToken } from "./review-token";

const secret = "a-long-test-secret-value";
const user = "11111111-2222-3333-4444-555555555555";
const now = 1_800_000_000;

describe("[R-REV-05] signed review link", () => {
  it("round-trips the user id within 24 h", () => {
    const t = createReviewToken(user, secret, now);
    expect(verifyReviewToken(t, secret, now + 3600)).toBe(user);
    expect(verifyReviewToken(t, secret, now + REVIEW_TOKEN_TTL_SECONDS)).toBe(user);
  });
  it("is refused after 24 h", () => {
    const t = createReviewToken(user, secret, now);
    expect(verifyReviewToken(t, secret, now + REVIEW_TOKEN_TTL_SECONDS + 1)).toBeNull();
  });
  it("is refused when tampered with (other user id, other signature, garbage)", () => {
    const t = createReviewToken(user, secret, now);
    const [payload, sig] = t.split(".");
    const other = Buffer.from(`review.99999999-2222-3333-4444-555555555555.${now + 100}`).toString("base64url");
    expect(verifyReviewToken(`${other}.${sig}`, secret, now)).toBeNull();
    expect(verifyReviewToken(`${payload}.AAAA`, secret, now)).toBeNull();
    expect(verifyReviewToken("garbage", secret, now)).toBeNull();
    expect(verifyReviewToken(`${t}.extra`, secret, now)).toBeNull();
  });
  it("is refused under another secret", () => {
    expect(verifyReviewToken(createReviewToken(user, secret, now), "different-secret", now)).toBeNull();
  });
  it("[R-SEC-02] fails closed when the secret is unset or empty", () => {
    expect(() => createReviewToken(user, undefined)).toThrow();
    expect(() => createReviewToken(user, "")).toThrow();
    const t = createReviewToken(user, secret, now);
    expect(verifyReviewToken(t, undefined, now)).toBeNull();
    expect(verifyReviewToken(t, "", now)).toBeNull();
    expect(verifyReviewToken(undefined, secret, now)).toBeNull();
  });
});

describe("[R-NOT-04] signed unsubscribe link", () => {
  it("round-trips for a year", () => {
    const t = createUnsubscribeToken(user, secret, now);
    expect(verifyUnsubscribeToken(t, secret, now + UNSUBSCRIBE_TOKEN_TTL_SECONDS)).toBe(user);
    expect(verifyUnsubscribeToken(t, secret, now + UNSUBSCRIBE_TOKEN_TTL_SECONDS + 1)).toBeNull();
  });
  it("is not interchangeable with a review link", () => {
    expect(verifyReviewToken(createUnsubscribeToken(user, secret, now), secret, now)).toBeNull();
    expect(verifyUnsubscribeToken(createReviewToken(user, secret, now), secret, now)).toBeNull();
  });
  it("is refused when the secret is unset or different", () => {
    const t = createUnsubscribeToken(user, secret, now);
    expect(verifyUnsubscribeToken(t, undefined, now)).toBeNull();
    expect(verifyUnsubscribeToken(t, "different-secret", now)).toBeNull();
    expect(() => createUnsubscribeToken(user, undefined, now)).toThrow();
  });
});
