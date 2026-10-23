import { describe, expect, it } from "vitest";
import { createMailpitMailer, requestMailer } from "@/server/mailpit";

const mail = { to: "reader@example.test", subject: "S", text: "T", html: "<p>H</p>" };

function fakeFetch() {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ ID: "m1", id: "r1" }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("[R-LAND-03] request mailer", () => {
  it("Mailpit when asked and not in production", async () => {
    const f = fakeFetch();
    const r = await requestMailer({ MAIL_TRANSPORT: "mailpit", MAILPIT_URL: "http://127.0.0.1:54324" }, f.fn).send(mail);
    expect(r.id).toBe("m1");
    expect(f.calls[0]!.url).toBe("http://127.0.0.1:54324/api/v1/send");
    expect((f.calls[0]!.body.To as { Email: string }[])[0]!.Email).toBe("reader@example.test");
  });

  it("never Mailpit in production: Resend instead", async () => {
    const f = fakeFetch();
    await requestMailer({ MAIL_TRANSPORT: "mailpit", MAILPIT_URL: "http://127.0.0.1:54324", VERCEL_ENV: "production", RESEND_API_KEY: "k", MAIL_FROM: "Memento <noreply@example.test>" }, f.fn).send(mail);
    expect(f.calls[0]!.url).toBe("https://api.resend.com/emails");
  });

  it("without the flag, Resend", async () => {
    const f = fakeFetch();
    await requestMailer({ RESEND_API_KEY: "k", MAILPIT_URL: "http://127.0.0.1:54324" }, f.fn).send(mail);
    expect(f.calls[0]!.url).toBe("https://api.resend.com/emails");
  });

  it("with nothing set, sending fails closed and nothing is fetched", async () => {
    const f = fakeFetch();
    await expect(requestMailer({}, f.fn).send(mail)).rejects.toThrow("RESEND_API_KEY is not set");
    expect(f.calls).toHaveLength(0);
  });

  it("the Mailpit mailer refuses a recipient with a line break", async () => {
    const f = fakeFetch();
    await expect(createMailpitMailer("http://127.0.0.1:54324", f.fn, () => "Memento <noreply@example.test>").send({ ...mail, to: "a@example.test\r\nBcc: b@example.test" })).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });
});
