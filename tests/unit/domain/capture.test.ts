import { describe, expect, it } from "vitest";
import { authDecision, captureTokenFrom, isAcceptedSender, isSharedCaptureAddress, parseAddress } from "@/domain/capture";

const token = "ab".repeat(10);

describe("[R-CAP-01] capture address", () => {
  it("extracts the token from the recipient list", () => {
    expect(captureTokenFrom([`${token}@abc.resend.app`])).toBe(token);
    expect(captureTokenFrom(["x@y.z", `Me <${token}@abc.resend.app>`])).toBe(token);
  });
  it("[R-OPS-03] works on the product domain too: the domain is ignored, the token is the user", () => {
    expect(captureTokenFrom([`${token}@mailtomemento.com`])).toBe(token);
    expect(captureTokenFrom([`Memento <${token}@MailToMemento.com>`])).toBe(token);
    expect(captureTokenFrom(["memento@mailtomemento.com"])).toBeNull();
  });
  it("ignores recipients that are not tokens", () => {
    expect(captureTokenFrom(["hello@abc.resend.app", "0123@abc.resend.app", `${token}0@abc.resend.app`])).toBeNull();
  });
});

describe("[R-CAP-02] sender check", () => {
  it("accepts the account email in any case or display-name form", () => {
    expect(isAcceptedSender("Hugues <Hugues@Example.com>", "hugues@example.com")).toBe(true);
    expect(isAcceptedSender("hugues@example.com", "Hugues@Example.com")).toBe(true);
  });
  it("rejects a foreign sender, a look-alike and garbage", () => {
    expect(isAcceptedSender("evil@example.com", "hugues@example.com")).toBe(false);
    expect(isAcceptedSender("hugues@example.com.evil.io", "hugues@example.com")).toBe(false);
    expect(isAcceptedSender("not an address", "hugues@example.com")).toBe(false);
  });
  it("accepts a verified linked address only", () => {
    expect(isAcceptedSender("alt@example.com", "hugues@example.com", ["alt@example.com"])).toBe(true);
  });
  it("parses addresses", () => {
    expect(parseAddress("A <B@C.d>")).toBe("b@c.d");
    expect(parseAddress("nope")).toBeNull();
  });
});

describe("[R-CAP-12] shared address add@", () => {
  const dom = "mailtomemento.com";
  it("accepts add@ on the receiving domain and on resend.app, in any case and display-name form", () => {
    expect(isSharedCaptureAddress(["add@mailtomemento.com"], dom)).toBe(true);
    expect(isSharedCaptureAddress(["Memento <ADD@MailToMemento.com>"], dom)).toBe(true);
    expect(isSharedCaptureAddress(["x@y.z", "add@abc123.resend.app"], dom)).toBe(true);
    expect(isSharedCaptureAddress(["add@abc123.resend.app"], null)).toBe(true);
  });
  it("refuses plus-tags, other local parts and other domains", () => {
    expect(isSharedCaptureAddress(["add+x@mailtomemento.com"], dom)).toBe(false);
    expect(isSharedCaptureAddress(["adds@mailtomemento.com", "ad@mailtomemento.com", "add.me@mailtomemento.com"], dom)).toBe(false);
    expect(isSharedCaptureAddress(["add@other-service.com", "add@mailtomemento.com.evil.io", "add@resend.app.evil.io"], dom)).toBe(false);
    expect(isSharedCaptureAddress(["add@mailtomemento.com"], null)).toBe(false);
    expect(isSharedCaptureAddress(["add@x@mailtomemento.com", "not an address"], dom)).toBe(false);
  });
  it("[R-CAP-03] the shared path accepts only dkim=pass and waits on processing", () => {
    expect(authDecision("shared", { dkim: "pass", spf: "fail", dmarc: "gray" })).toBe("accept");
    for (const dkim of ["gray", "fail", "processing_failed", "unknown", null, undefined]) {
      expect([dkim, authDecision("shared", { dkim })]).toEqual([dkim, "reject"]);
    }
    expect(authDecision("shared", null)).toBe("reject");
    expect(authDecision("shared", { dkim: "processing" })).toBe("wait");
  });
  it("[R-CAP-03] the token path refuses only dkim=fail", () => {
    expect(authDecision("token", { dkim: "fail" })).toBe("reject");
    for (const dkim of ["pass", "gray", "processing_failed", "unknown", "processing", null]) {
      expect([dkim, authDecision("token", { dkim })]).toEqual([dkim, "accept"]);
    }
    expect(authDecision("token", null)).toBe("accept");
  });
});
