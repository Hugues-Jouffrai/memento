import { beforeEach, describe, expect, it } from "vitest";
import type { Locale } from "@/i18n/locale";
import type { OutboundMail } from "@/server/ports";
import { confirmWaitlist, leaveWaitlist, requestWaitlist, type WaitlistDeps } from "@/server/waitlist";
import { sealWaitlistToken } from "@/server/waitlist-token";
import { localAdmin } from "./support";

const db = localAdmin();
const SECRET = "integration-waitlist-secret";
const mail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
let ipCounter = 0;
const ip = () => `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

const sent: OutboundMail[] = [];
const mailer = { send: async (m: OutboundMail) => (sent.push(m), { id: "fake" }) };
const deps = (over: Partial<WaitlistDeps> = {}): WaitlistDeps => ({ db, mailer, appUrl: "https://app.test", secret: SECRET, ...over });
const ask = (email: unknown, o: { honeypot?: unknown; ip?: string | null; locale?: Locale; deps?: Partial<WaitlistDeps> } = {}) =>
  requestWaitlist(deps(o.deps), { email, honeypot: o.honeypot ?? "", ip: o.ip === undefined ? ip() : o.ip, locale: o.locale ?? "fr" });
const mailsTo = (to: string) => sent.filter((m) => m.to === to);
const tokenFrom = (m: OutboundMail, kind: "confirm" | "leave") => m.text.match(new RegExp(`/notify/${kind}/([A-Za-z0-9_-]+)`))![1]!;
const rows = async (email: string) => (await db.from("waitlist").select("*").eq("email", email)).data ?? [];
const waitlistHits = async () => (await db.from("rate_hit").select("key").like("key", "waitlist:%")).data ?? [];

beforeEach(async () => {
  sent.length = 0;
  await db.from("rate_hit").delete().like("key", "waitlist:%");
});

describe("[R-LAND-04] double opt-in", () => {
  it("a request stores nothing; the mail's token stores the address once", async () => {
    const email = mail("optin");
    expect(await ask(email)).toBe("sent");
    expect(mailsTo(email)).toHaveLength(1);
    expect(await rows(email)).toHaveLength(0);

    const token = tokenFrom(sent[0]!, "confirm");
    expect(await confirmWaitlist({ db, secret: SECRET }, token)).toBe("ok");
    const first = await rows(email);
    expect(first).toHaveLength(1);
    expect(first[0]!.locale).toBe("fr");

    expect(await confirmWaitlist({ db, secret: SECRET }, token)).toBe("ok");
    const again = await rows(email);
    expect(again).toHaveLength(1);
    expect(again[0]!.confirmed_at).toBe(first[0]!.confirmed_at);
  });

  it("a confirm token older than three days is invalid and stores nothing", async () => {
    const email = mail("old");
    const old = sealWaitlistToken("confirm", email, "fr", SECRET, 3 * 86_400, Math.floor(Date.now() / 1000) - 4 * 86_400);
    expect(await confirmWaitlist({ db, secret: SECRET }, old)).toBe("invalid");
    expect(await rows(email)).toHaveLength(0);
  });
});

describe("[R-LAND-03] same answer for everyone", () => {
  it("a listed and an unlisted address get the same answer and the same mail", async () => {
    const listed = mail("listed");
    const fresh = mail("fresh");
    await db.from("waitlist").insert({ email: listed, locale: "fr" });
    const before = (await rows(listed))[0]!;
    expect(await ask(listed)).toBe("sent");
    expect(await ask(fresh)).toBe("sent");
    const a = mailsTo(listed);
    const b = mailsTo(fresh);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]!.subject).toBe(b[0]!.subject);
    const mask = (t: string) => t.replace(/https?:\/\/\S+/g, "<url>");
    expect(mask(a[0]!.text)).toBe(mask(b[0]!.text));
    expect((await rows(listed))[0]).toEqual(before);
  });

  it("the honeypot answers sent, sends nothing and leaves no rate-limit row", async () => {
    const email = mail("bot");
    expect(await ask(email, { honeypot: "x" })).toBe("sent");
    expect(sent).toHaveLength(0);
    expect(await waitlistHits()).toHaveLength(0);
  });

  it("an invalid address answers invalid and sends nothing", async () => {
    expect(await ask("nope")).toBe("invalid");
    expect(await ask(undefined)).toBe("invalid");
    expect(sent).toHaveLength(0);
  });

  it("a mailer that throws answers failed and stores nothing; an unset secret answers failed without mail", async () => {
    const email = mail("down");
    const broken = { send: async () => Promise.reject(new Error("provider down")) };
    expect(await ask(email, { deps: { mailer: broken } })).toBe("failed");
    expect(await rows(email)).toHaveLength(0);
    expect(await ask(mail("nosecret"), { deps: { secret: undefined } })).toBe("failed");
    expect(sent).toHaveLength(0);
  });
});

describe("[R-LAND-06] rate limits", () => {
  it("3 requests per address a day, then limited", async () => {
    const email = mail("addr");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await ask(email, { ip: ip() }));
    expect(results).toEqual(["sent", "sent", "sent", "limited"]);
    expect(mailsTo(email)).toHaveLength(3);
  });

  it("10 requests per network address an hour, then limited", async () => {
    const same = ip();
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await ask(mail("net"), { ip: same }));
    expect(results.filter((r) => r === "sent")).toHaveLength(10);
    expect(results[10]).toBe("limited");
  });

  it("the whole-site cap answers limited and sends nothing", async () => {
    await db.from("rate_hit").insert(Array.from({ length: 20 }, () => ({ key: "waitlist:all" })));
    const email = mail("site");
    expect(await ask(email)).toBe("limited");
    expect(mailsTo(email)).toHaveLength(0);
  });

  it("rate-limit keys are hashes: no address, no @", async () => {
    const email = mail("hashed");
    await ask(email, { ip: "203.0.113.9" });
    const keys = (await waitlistHits()).map((r) => r.key as string);
    expect(keys.length).toBe(3);
    for (const k of keys) {
      expect(k).not.toContain("@");
      expect(k).not.toContain(email);
      expect(k).not.toContain("203.0.113.9");
    }
  });
});

describe("[R-LAND-13] the confirmation mail is not logged per user", () => {
  it("no email_out row mentions the address", async () => {
    const email = mail("outbox");
    expect(await ask(email)).toBe("sent");
    const { data } = await db.from("email_out").select("id").eq("to_address", email);
    expect(data).toHaveLength(0);
  });
});

describe("[R-LAND-07] leaving", () => {
  it("the leave link removes a confirmed address, and again, and for a never-listed address", async () => {
    const email = mail("leave");
    await ask(email);
    await confirmWaitlist({ db, secret: SECRET }, tokenFrom(sent[0]!, "confirm"));
    expect(await rows(email)).toHaveLength(1);
    const leave = tokenFrom(sent[0]!, "leave");
    expect(await leaveWaitlist({ db, secret: SECRET }, leave)).toBe("ok");
    expect(await rows(email)).toHaveLength(0);
    expect(await leaveWaitlist({ db, secret: SECRET }, leave)).toBe("ok");

    const never = mail("never");
    await ask(never);
    expect(await leaveWaitlist({ db, secret: SECRET }, tokenFrom(sent[1]!, "leave"))).toBe("ok");
  });

  it("a confirm token does not leave, and a leave token does not confirm", async () => {
    const email = mail("swap");
    await ask(email);
    const m = sent[0]!;
    expect(await leaveWaitlist({ db, secret: SECRET }, tokenFrom(m, "confirm"))).toBe("invalid");
    expect(await confirmWaitlist({ db, secret: SECRET }, tokenFrom(m, "leave"))).toBe("invalid");
    expect(await rows(email)).toHaveLength(0);
  });
});
