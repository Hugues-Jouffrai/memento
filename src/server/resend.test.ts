import { describe, expect, it } from "vitest";
import { createResendMailSource } from "./resend";

/** A fake fetch that answers one received email shaped like Resend's GET /emails/receiving/{id}. */
function fakeFetch(body: object) {
  const calls: { url: string; auth: string | null }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("[R-CAP-03] Resend received email", () => {
  it("reads authentication from GET /emails/receiving/{id} with a bearer key", async () => {
    const { fn, calls } = fakeFetch({
      id: "e-1",
      subject: "s",
      text: "t",
      html: null,
      message_id: "<m@x>",
      attachments: [],
      authentication: { spf: "pass", dkim: "gray", dmarc: "gray" },
    });
    const mail = await createResendMailSource("re_test", fn).fetchReceived("e-1");
    expect(calls).toEqual([{ url: "https://api.resend.com/emails/receiving/e-1", auth: "Bearer re_test" }]);
    expect(mail.authentication).toEqual({ spf: "pass", dkim: "gray", dmarc: "gray" });
  });

  it("gives null when Resend reports no authentication (older mail)", async () => {
    const { fn } = fakeFetch({ id: "e-2", subject: null, text: "t", html: null, authentication: null });
    expect((await createResendMailSource("re_test", fn).fetchReceived("e-2")).authentication).toBeNull();
    const { fn: fn2 } = fakeFetch({ id: "e-3", text: "t" });
    expect((await createResendMailSource("re_test", fn2).fetchReceived("e-3")).authentication).toBeNull();
  });
});

describe("[R-NOT-04] Resend sender headers", () => {
  it("passes List-Unsubscribe headers on, flattened to one line", async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    }) as unknown as typeof fetch;
    const { createResendMailer } = await import("./resend");
    await createResendMailer("key", fetchFn, () => "Memento <noreply@mailtomemento.com>").send({
      to: "a@example.test", subject: "s", text: "t", html: "<p>t</p>",
      headers: { "List-Unsubscribe": "<https://x.test/u>\r\nBcc: evil@example.test", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    expect(body.headers).toEqual({ "List-Unsubscribe": "<https://x.test/u> Bcc: evil@example.test", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });
});
