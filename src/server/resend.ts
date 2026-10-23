import { parseAddress } from "@/domain/capture";
import { mailFrom } from "./config";
import type { Mailer, MailSource, OutboundMail, ReceivedMail } from "./ports";

const API = "https://api.resend.com";

/** R-SEC-08: addresses are validated and header-bound fields can never carry line breaks. */
export function safeHeaderValue(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

export function createResendMailSource(apiKey: string | undefined, fetchFn: typeof fetch = fetch): MailSource {
  return {
    async fetchReceived(emailId: string): Promise<ReceivedMail> {
      if (!apiKey) throw new Error("RESEND_API_KEY is not set");
      const res = await fetchFn(`${API}/emails/receiving/${encodeURIComponent(emailId)}`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Resend receiving API answered ${res.status}`);
      const j = (await res.json()) as {
        subject?: string | null;
        text?: string | null;
        html?: string | null;
        message_id?: string | null;
        authentication?: { spf?: string | null; dkim?: string | null; dmarc?: string | null } | null;
        attachments?: { id: string; filename?: string | null; content_type?: string | null; content_disposition?: string | null; size?: number }[];
      };
      return {
        subject: j.subject ?? null,
        text: j.text ?? null,
        html: j.html ?? null,
        messageId: j.message_id ?? null,
        // R-CAP-03: computed by Resend's receiving server, null for mail received before the field existed.
        authentication: j.authentication
          ? { spf: j.authentication.spf ?? null, dkim: j.authentication.dkim ?? null, dmarc: j.authentication.dmarc ?? null }
          : null,
        attachments: (j.attachments ?? []).map((a) => ({
          id: a.id,
          filename: a.filename ?? "file",
          contentType: a.content_type ?? "application/octet-stream",
          size: a.size ?? 0,
          disposition: a.content_disposition ?? null,
        })),
      };
    },
    async fetchAttachment(emailId, attachmentId, maxBytes) {
      if (!apiKey) throw new Error("RESEND_API_KEY is not set");
      const metaRes = await fetchFn(`${API}/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!metaRes.ok) throw new Error(`Resend attachment API answered ${metaRes.status}`);
      const meta = (await metaRes.json()) as { filename?: string; content_type?: string; download_url?: string; size?: number };
      if (!meta.download_url || !meta.download_url.startsWith("https://")) throw new Error("attachment has no https download_url");
      if ((meta.size ?? 0) > maxBytes) throw new Error("attachment is above the size limit");
      const file = await fetchFn(meta.download_url);
      if (!file.ok) throw new Error(`attachment download answered ${file.status}`);
      const data = Buffer.from(await file.arrayBuffer());
      if (data.length > maxBytes) throw new Error("attachment is above the size limit");
      return { filename: meta.filename ?? "file", contentType: meta.content_type ?? "application/octet-stream", data };
    },
  };
}

/** The sender comes from MAIL_FROM (R-OPS-03), read at send time so a bad value fails the send, not the whole worker. */
export function createResendMailer(apiKey: string | undefined, fetchFn: typeof fetch = fetch, from: () => string = () => mailFrom()): Mailer {
  return {
    async send(mail: OutboundMail) {
      if (!apiKey) throw new Error("RESEND_API_KEY is not set");
      const sender = from();
      const to = parseAddress(mail.to);
      if (!to || /[\r\n]/.test(mail.to)) throw new Error("Invalid recipient address");
      const res = await fetchFn(`${API}/emails`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: sender, to: [to], subject: safeHeaderValue(mail.subject), text: mail.text, html: mail.html, ...(mail.headers ? { headers: Object.fromEntries(Object.entries(mail.headers).map(([k, v]) => [k, safeHeaderValue(v)])) } : {}) }),
      });
      if (!res.ok) throw new Error(`Resend send API answered ${res.status}`);
      const j = (await res.json()) as { id?: string };
      return { id: j.id ?? null };
    },
  };
}
