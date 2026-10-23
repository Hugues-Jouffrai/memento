import { BRAND } from "@/config/brand";
import { parseAddress } from "@/domain/capture";

/**
 * R-OPS-03: per-deployment settings for the brand (D49). The only module that reads MAIL_FROM,
 * RESEND_RECEIVING_DOMAIN and APP_URL from the environment.
 */
type Env = Record<string, string | undefined>;

/** Sender used outside production when MAIL_FROM is not set: Resend's shared test domain (D26). */
const DEV_FALLBACK_ADDRESS = "onboarding@resend.dev";

/**
 * The From header of every outgoing mail, e.g. "Memento <noreply@mailtomemento.com>".
 * R-SEC-08: validated with the capture address parser and never carries a line break. Required in production:
 * a missing or invalid value throws, so nothing is sent from an unintended sender (fail closed).
 */
export function mailFrom(env: Env = process.env): string {
  const raw = env.MAIL_FROM;
  if (raw === undefined || raw.trim() === "") {
    if (env.VERCEL_ENV === "production") throw new Error("MAIL_FROM is not set");
    return `${BRAND.name} <${DEV_FALLBACK_ADDRESS}>`;
  }
  if (/[\r\n]/.test(raw)) throw new Error("MAIL_FROM contains a line break");
  if (!parseAddress(raw)) throw new Error("MAIL_FROM is not a valid address");
  return raw.trim();
}

/** Domain of the capture addresses (`<token>@<domain>`), or null when not configured or not a hostname. */
export function receivingDomain(env: Env = process.env): string | null {
  const d = env.RESEND_RECEIVING_DOMAIN?.trim().toLowerCase();
  return d && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) ? d : null;
}

/** Public base URL of the app, used in emails and to call the worker. */
export function appUrl(env: Env = process.env): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
