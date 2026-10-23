import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { BRAND, withBrand } from "@/config/brand";
import { parseAddress } from "@/domain/capture";
import { appUrl, mailFrom, receivingDomain } from "@/server/config";
import { MAIL_MESSAGES } from "@/server/messages";
import { createResendMailer } from "@/server/resend";

const ROOT = process.cwd();
const rel = (f: string) => path.relative(ROOT, f).replaceAll("\\", "/");
function walk(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** The one place allowed to hold old names. */
const BRAND_FILE = "src/config/brand.ts";
/**
 * Known leftovers outside a change's reach, each with the reason. Keep this list short and empty it soon.
 * Empty since 2026-10-21 (the stylesheet header was the last entry).
 */
const PENDING = new Set<string>();

const oldName = new RegExp(BRAND.previousNames.join("|"), "i");

/** Minimal reader for the parts of supabase/config.toml that carry the name: section -> key -> raw value. */
function tomlSections(text: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  let current = "";
  for (const line of text.split(/\r?\n/)) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) {
      current = section[1]!;
      out.set(current, new Map());
      continue;
    }
    const kv = line.match(/^\s*([A-Za-z_]+)\s*=\s*"([^"]*)"/);
    if (kv && current) out.get(current)!.set(kv[1]!, kv[2]!);
  }
  return out;
}
const toml = tomlSections(readFileSync("supabase/config.toml", "utf8"));
const authSubjects = [...toml.entries()].filter(([s]) => s.startsWith("auth.email.template.")).map(([s, kv]) => [s, kv.get("subject") ?? ""] as const);
const smtp = toml.get("remotes.production.auth.email.smtp")!;

function leaves(obj: unknown, prefix = ""): [string, string][] {
  if (typeof obj === "string") return [[prefix, obj]];
  if (obj && typeof obj === "object") return Object.entries(obj).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  return [];
}
const messages = Object.fromEntries(["fr", "en"].map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8")) as Record<string, unknown>]));

describe("[R-OPS-03] the product name is configuration", () => {
  it("(a) no old name is left in src, app, messages, auth templates or auth subjects", () => {
    const files = ["src", "app", "messages", "supabase/templates"].flatMap((d) => walk(path.join(ROOT, d))).map(rel);
    const offenders = files.filter((f) => f !== BRAND_FILE && !PENDING.has(f) && oldName.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
    expect(authSubjects.length).toBeGreaterThanOrEqual(2);
    for (const [section, subject] of authSubjects) expect(subject, section).not.toMatch(oldName);
    expect(smtp.get("sender_name")).not.toMatch(oldName);
  });

  it("(a) the pending list only holds files that still need it", () => {
    for (const f of PENDING) expect(readFileSync(f, "utf8"), f).toMatch(oldName);
  });

  it("(b) config.toml subjects, SMTP sender and the magic-link template carry the current name", () => {
    for (const [section, subject] of authSubjects) expect(subject, section).toContain(BRAND.name);
    expect(smtp.get("sender_name")).toBe(BRAND.name);
    const admin = smtp.get("admin_email") ?? "";
    expect(parseAddress(admin)).toBe(admin);
    expect(admin).not.toMatch(/resend\.dev$/);
    const template = readFileSync("supabase/templates/magic_link.html", "utf8");
    expect(template).toContain(BRAND.name);
    expect(template).toContain("{{ .Token }}");
  });

  it("(c) messages never write the name: they use {brand}, filled by withBrand", () => {
    for (const [lang, m] of Object.entries(messages)) {
      const written = leaves(m).filter(([, v]) => v.includes(BRAND.name) || oldName.test(v));
      expect(written, lang).toEqual([]);
      expect((m.app as Record<string, string>).name, lang).toBe("{brand}");
      const filled = withBrand(m);
      expect(leaves(filled).filter(([, v]) => v.includes("{brand}")), lang).toEqual([]);
    }
    // Same keys use the placeholder in both languages.
    const keys = (l: string) => leaves(messages[l]).filter(([, v]) => v.includes("{brand}")).map(([k]) => k);
    expect(keys("en")).toEqual(keys("fr"));
    // The name is inserted as plain text, so it must not contain ICU syntax.
    expect(BRAND.name).not.toMatch(/[{}'#<>]/);
  });

  it("(c) next-intl renders the name from the branded messages (pages and mails)", () => {
    for (const lang of ["fr", "en"] as const) {
      expect(createTranslator({ locale: lang, messages: MAIL_MESSAGES[lang], namespace: "app" })("name")).toBe(BRAND.name);
      expect(createTranslator({ locale: lang, messages: MAIL_MESSAGES[lang], namespace: "email.reminder" })("intro")).toContain(BRAND.name);
    }
  });

  it("withBrand replaces every occurrence and keeps the shape", () => {
    expect(withBrand({ a: "{brand} et {brand}", b: { c: ["x {brand}"] }, n: 1 }, "Y")).toEqual({ a: "Y et Y", b: { c: ["x Y"] }, n: 1 });
  });
});

describe("[R-OPS-03] [R-SEC-08] MAIL_FROM", () => {
  const good = "Memento <noreply@mailtomemento.com>";

  it("accepts a display name with an address, or a bare address", () => {
    expect(mailFrom({ MAIL_FROM: good, VERCEL_ENV: "production" })).toBe(good);
    expect(mailFrom({ MAIL_FROM: " noreply@mailtomemento.com " })).toBe("noreply@mailtomemento.com");
  });

  it("rejects line breaks (header injection) and values that are not an address", () => {
    expect(() => mailFrom({ MAIL_FROM: `${good}\r\nBcc: evil@example.com` })).toThrow(/line break/);
    expect(() => mailFrom({ MAIL_FROM: "Memento <noreply@mailtomemento.com>\n" })).toThrow(/line break/);
    expect(() => mailFrom({ MAIL_FROM: "Memento" })).toThrow(/valid address/);
  });

  it("fails closed in production when missing; uses the test sender elsewhere", () => {
    expect(() => mailFrom({ VERCEL_ENV: "production" })).toThrow(/not set/);
    expect(() => mailFrom({ VERCEL_ENV: "production", MAIL_FROM: "  " })).toThrow(/not set/);
    expect(mailFrom({})).toBe(`${BRAND.name} <onboarding@resend.dev>`);
  });

  it("the Resend mailer sends from MAIL_FROM and sends nothing when it is invalid", async () => {
    const bodies: { from: string }[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const mail = { to: "hugues@example.com", subject: "s", text: "t", html: "<p>t</p>" };
    await createResendMailer("key", fetchFn, () => mailFrom({ MAIL_FROM: good })).send(mail);
    expect(bodies[0]!.from).toBe(good);
    await expect(createResendMailer("key", fetchFn, () => mailFrom({ VERCEL_ENV: "production" })).send(mail)).rejects.toThrow(/MAIL_FROM/);
    expect(bodies).toHaveLength(1);
  });
});

describe("[R-OPS-03] capture domain and app URL", () => {
  it("reads RESEND_RECEIVING_DOMAIN as the capture domain", () => {
    expect(receivingDomain({ RESEND_RECEIVING_DOMAIN: "mailtomemento.com" })).toBe("mailtomemento.com");
    expect(receivingDomain({ RESEND_RECEIVING_DOMAIN: " Abc.Resend.App " })).toBe("abc.resend.app");
    expect(receivingDomain({})).toBeNull();
    expect(receivingDomain({ RESEND_RECEIVING_DOMAIN: "<script>" })).toBeNull();
  });

  it("reads APP_URL, then the Vercel production URL", () => {
    expect(appUrl({ APP_URL: "https://leitnerbox-v2.vercel.app/" })).toBe("https://leitnerbox-v2.vercel.app");
    expect(appUrl({ VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe("https://x.vercel.app");
    expect(appUrl({})).toBe("http://localhost:3000");
  });

  it("no other module reads these variables from the environment", () => {
    const files = ["src", "app"].flatMap((d) => walk(path.join(ROOT, d))).map(rel).filter((f) => /\.(ts|tsx)$/.test(f));
    const offenders = files.filter((f) => f !== "src/server/config.ts" && /process\.env\.(MAIL_FROM|RESEND_RECEIVING_DOMAIN|APP_URL)\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
