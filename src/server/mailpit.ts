import { BRAND } from "@/config/brand";
import { parseAddress } from "@/domain/capture";
import { mailFrom } from "./config";
import type { Mailer, OutboundMail } from "./ports";
import { createResendMailer, safeHeaderValue } from "./resend";

/** Local and e2e only (D27: dev mail never leaves the machine): Mailpit's HTTP send API. */
export function createMailpitMailer(baseUrl: string, fetchFn: typeof fetch = fetch, from: () => string = () => mailFrom()): Mailer {
  return {
    async send(mail: OutboundMail) {
      const to = parseAddress(mail.to);
      if (!to || /[\r\n]/.test(mail.to)) throw new Error("Invalid recipient address");
      const sender = parseAddress(from());
      const res = await fetchFn(`${baseUrl.replace(/\/+$/, "")}/api/v1/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ From: { Email: sender, Name: BRAND.name }, To: [{ Email: to }], Subject: safeHeaderValue(mail.subject), Text: mail.text, HTML: mail.html }),
      });
      if (!res.ok) throw new Error(`Mailpit send API answered ${res.status}`);
      const j = (await res.json()) as { ID?: string };
      return { id: j.ID ?? null };
    },
  };
}

/**
 * Mailer for web-request mail (the notify-me confirmation). Mailpit only when explicitly asked (MAIL_TRANSPORT=mailpit),
 * never in production; otherwise Resend, which throws on send when the key is missing (fail closed).
 * The explicit flag matters: `next start` also loads .env.local, which holds the real Resend key.
 */
export function requestMailer(env: Record<string, string | undefined> = process.env, fetchFn: typeof fetch = fetch): Mailer {
  if (env.MAIL_TRANSPORT === "mailpit" && env.VERCEL_ENV !== "production" && env.MAILPIT_URL) return createMailpitMailer(env.MAILPIT_URL, fetchFn);
  return createResendMailer(env.RESEND_API_KEY, fetchFn);
}
