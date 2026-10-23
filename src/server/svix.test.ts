import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hasValidBearer } from "./secrets";
import { verifySvix } from "./svix";

const secret = "whsec_" + Buffer.from("super-secret-key-bytes").toString("base64");
const body = '{"type":"email.received"}';
const now = 1_800_000_000;
const sign = (id: string, ts: number, b = body) =>
  "v1," + createHmac("sha256", Buffer.from("super-secret-key-bytes")).update(`${id}.${ts}.${b}`).digest("base64");
const ok = { id: "msg_1", timestamp: String(now), signature: sign("msg_1", now), body, secret, nowSec: now };

describe("[R-SEC-02] webhook signature (Svix)", () => {
  it("accepts a correctly signed request", () => expect(verifySvix(ok)).toBe(true));
  it("accepts when one of several signatures matches", () =>
    expect(verifySvix({ ...ok, signature: `v1,AAAA ${ok.signature}` })).toBe(true));
  it("rejects a tampered body", () => expect(verifySvix({ ...ok, body: body + " " })).toBe(false));
  it("rejects a wrong secret", () =>
    expect(verifySvix({ ...ok, secret: "whsec_" + Buffer.from("other").toString("base64") })).toBe(false));
  it("fails closed when the secret is unset or empty", () => {
    expect(verifySvix({ ...ok, secret: undefined })).toBe(false);
    expect(verifySvix({ ...ok, secret: "" })).toBe(false);
    expect(verifySvix({ ...ok, secret: "whsec_" })).toBe(false);
  });
  it("rejects missing headers", () => {
    expect(verifySvix({ ...ok, id: null })).toBe(false);
    expect(verifySvix({ ...ok, signature: null })).toBe(false);
  });
  it("rejects a replay outside the 5-minute window", () => expect(verifySvix({ ...ok, nowSec: now + 301 })).toBe(false));
});

describe("[R-SEC-02] bearer secret for internal endpoints", () => {
  it("accepts the right secret", () => expect(hasValidBearer("Bearer s3cret", "s3cret")).toBe(true));
  it("rejects no header, a wrong secret and a wrong length", () => {
    expect(hasValidBearer(null, "s3cret")).toBe(false);
    expect(hasValidBearer("Bearer nope!!", "s3cret")).toBe(false);
    expect(hasValidBearer("Bearer s3cre", "s3cret")).toBe(false);
  });
  it("fails closed when the secret is unset or empty, even with an empty bearer", () => {
    expect(hasValidBearer("Bearer s3cret", undefined)).toBe(false);
    expect(hasValidBearer("Bearer s3cret", "")).toBe(false);
    expect(hasValidBearer("Bearer ", "")).toBe(false);
  });
});
