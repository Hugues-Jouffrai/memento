/** Notify-me list for visitors (D54, R-LAND). Pure rules: limits, durations, result states, CSV. No I/O. */
import { toCsv } from "./export";

/** Requests per address per 24 h: also the most confirmation mails anyone's inbox can get in a day. */
export const WAITLIST_LIMIT_PER_EMAIL = 3;
export const WAITLIST_EMAIL_WINDOW_SECONDS = 86_400;
export const WAITLIST_LIMIT_PER_IP = 10;
export const WAITLIST_IP_WINDOW_SECONDS = 3_600;
/** Whole site per 24 h: keeps headroom in the Resend quota that sign-in mails share. */
export const WAITLIST_LIMIT_GLOBAL = 20;
export const WAITLIST_GLOBAL_WINDOW_SECONDS = 86_400;
export const WAITLIST_CONFIRM_TTL_SECONDS = 3 * 86_400;
/** Leave links sit in old mails: valid longer than the retention. */
export const WAITLIST_LEAVE_TTL_SECONDS = 2 * 365 * 86_400;
/** Must match the interval in supabase/migrations/20261016180000_waitlist.sql (a unit test checks it). */
export const WAITLIST_RETENTION_MONTHS = 12;

export const NOTIFY_STATES = ["sent", "invalid", "limited", "failed"] as const;
export type NotifyState = (typeof NOTIFY_STATES)[number];
export const isNotifyState = (v: unknown): v is NotifyState => typeof v === "string" && (NOTIFY_STATES as readonly string[]).includes(v);

/** rate_hit keys; the caller passes SHA-256 hex digests, never raw values. */
export const waitlistRateKeys = (emailHash: string, ipHash: string) => ({
  email: `waitlist:email:${emailHash}`,
  ip: `waitlist:ip:${ipHash}`,
  all: "waitlist:all",
});

export interface WaitlistRow {
  email: string;
  locale: string;
  confirmed_at: string;
}
/** CSV export for scripts/waitlist.ts (cells defused against spreadsheet formulas by toCsv). */
export const waitlistCsv = (rows: readonly WaitlistRow[]) => toCsv(["email", "locale", "confirmed_at"], rows.map((r) => [r.email, r.locale, r.confirmed_at]));
