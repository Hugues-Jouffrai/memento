import type { SupabaseClient } from "@supabase/supabase-js";
import type { Gateway } from "@/ai/gateway";
import type { AttachmentMeta } from "@/domain/attachments";
import type { MailAuthentication } from "@/domain/capture";
import type { PageFetcher } from "./fetcher";
import type { FileStore } from "./storage";

export interface ReceivedMail {
  subject: string | null;
  text: string | null;
  html: string | null;
  messageId: string | null;
  attachments?: AttachmentMeta[];
  /** SPF / DKIM / DMARC as computed by the provider's receiving server (R-CAP-03); null when not reported. */
  authentication?: MailAuthentication | null;
}

/** Reads the body of an inbound mail (the webhook carries metadata only, D25). */
export interface MailSource {
  fetchReceived(emailId: string): Promise<ReceivedMail>;
  /** Downloads one attachment (refuses above maxBytes). */
  fetchAttachment(emailId: string, attachmentId: string, maxBytes: number): Promise<{ filename: string; contentType: string; data: Buffer }>;
}

export interface OutboundMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers (List-Unsubscribe). Built by the code, values are single-line. */
  headers?: Record<string, string>;
}

export interface Mailer {
  send(mail: OutboundMail): Promise<{ id: string | null }>;
}

export interface PipelineDeps {
  db: SupabaseClient;
  ai: Gateway;
  source: MailSource;
  mailer: Mailer;
  pages: PageFetcher;
  files: FileStore;
  appUrl: string;
  /** Secret that signs review links (R-REV-05). Unset means reminders cannot be built (fail closed). */
  reviewLinkSecret?: string;
  now: () => Date;
}

/** A failure retrying cannot fix. The capture ends `failed` at once with a receipt that says why. */
export type FailureReason =
  | "too_short"
  | "no_claims"
  | "fetch_error"
  | "ai_error"
  | "paywall"
  | "empty_page"
  | "url_blocked"
  | "page_error"
  | "unsupported_link"
  | "file_too_large"
  | "unsupported_file"
  | "unreadable_file"
  | "unknown";

export class PermanentError extends Error {
  constructor(readonly reason: FailureReason) {
    super(`permanent failure: ${reason}`);
    this.name = "PermanentError";
  }
}
