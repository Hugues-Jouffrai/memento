const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

export function parseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return v.length <= 254 && EMAIL_RE.test(v) ? v : null;
}

/** Accepts the code as typed ("123 456" or "123456"); returns the 6 digits or null. */
export function parseCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.replace(/\s+/g, "");
  return CODE_RE.test(v) ? v : null;
}

/** Only same-site relative paths are allowed after sign-in (no open redirect). */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}

/** Seconds Auth asks to wait, read from its 429 message ("...you can only request this after 48 seconds."); 60 when absent or absurd. */
export const DEFAULT_RESEND_SECONDS = 60;
export function parseRetrySeconds(message: unknown): number {
  const m = typeof message === "string" ? /(\d{1,4})\s*seconds?/i.exec(message) : null;
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 3600 ? n : DEFAULT_RESEND_SECONDS;
}
