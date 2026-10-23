import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/locale";
import {
  WAITLIST_CONFIRM_TTL_SECONDS,
  WAITLIST_EMAIL_WINDOW_SECONDS,
  WAITLIST_GLOBAL_WINDOW_SECONDS,
  WAITLIST_IP_WINDOW_SECONDS,
  WAITLIST_LEAVE_TTL_SECONDS,
  WAITLIST_LIMIT_GLOBAL,
  WAITLIST_LIMIT_PER_EMAIL,
  WAITLIST_LIMIT_PER_IP,
  waitlistRateKeys,
  type NotifyState,
} from "@/domain/waitlist";
import { parseEmail } from "./auth";
import { buildWaitlistConfirmMail } from "./emails";
import { hashSecret } from "./join";
import type { Mailer } from "./ports";
import { openWaitlistToken, sealWaitlistToken, type WaitlistPurpose } from "./waitlist-token";

export interface WaitlistDeps {
  db: SupabaseClient;
  mailer: Mailer;
  appUrl: string;
  secret: string | undefined;
  nowSec?: () => number;
}

/**
 * R-LAND-03, R-LAND-04, R-LAND-06 (D54): a visitor asks to be told when the product opens. The steps and their order are
 * the table in docs/landing-spec.md §4. The list is never read here, so a listed address, an account's address and a new
 * one get the same answer and the same mail. Nothing is stored until the owner confirms. Log lines never carry an address.
 */
export async function requestWaitlist(deps: WaitlistDeps, input: { email: unknown; honeypot: unknown; ip: string | null; locale: Locale }): Promise<NotifyState> {
  if (typeof input.honeypot === "string" && input.honeypot.trim() !== "") {
    console.info(JSON.stringify({ event: "waitlist_honeypot" }));
    return "sent";
  }
  const email = parseEmail(input.email);
  if (!email) return "invalid";
  if (!deps.secret) {
    console.error(JSON.stringify({ event: "waitlist_confirm_failed", error: "REVIEW_LINK_SECRET is not set" }));
    return "failed";
  }

  const keys = waitlistRateKeys(hashSecret(email), hashSecret(input.ip ?? "unknown"));
  const checks = [
    { key: keys.email, limit: WAITLIST_LIMIT_PER_EMAIL, window: WAITLIST_EMAIL_WINDOW_SECONDS },
    { key: keys.ip, limit: WAITLIST_LIMIT_PER_IP, window: WAITLIST_IP_WINDOW_SECONDS },
    { key: keys.all, limit: WAITLIST_LIMIT_GLOBAL, window: WAITLIST_GLOBAL_WINDOW_SECONDS },
  ];
  for (const c of checks) {
    const { data, error } = await deps.db.rpc("rate_check", { p_key: c.key, p_limit: c.limit, p_window_seconds: c.window });
    if (error) {
      console.error(JSON.stringify({ event: "waitlist_confirm_failed", error: String(error.message).slice(0, 200) }));
      return "failed";
    }
    if (data === false) return "limited";
  }

  try {
    const now = (deps.nowSec ?? (() => Math.floor(Date.now() / 1000)))();
    const confirm = sealWaitlistToken("confirm", email, input.locale, deps.secret, WAITLIST_CONFIRM_TTL_SECONDS, now);
    const leave = sealWaitlistToken("leave", email, input.locale, deps.secret, WAITLIST_LEAVE_TTL_SECONDS, now);
    const mail = buildWaitlistConfirmMail(input.locale, {
      confirmUrl: `${deps.appUrl}/notify/confirm/${confirm}`,
      leaveUrl: `${deps.appUrl}/notify/leave/${leave}`,
      days: WAITLIST_CONFIRM_TTL_SECONDS / 86_400,
    });
    const { id } = await deps.mailer.send({ to: email, ...mail });
    console.info(JSON.stringify({ event: "waitlist_confirm_sent", id }));
    return "sent";
  } catch (err) {
    console.error(JSON.stringify({ event: "waitlist_confirm_failed", error: String(err).slice(0, 200) }));
    return "failed";
  }
}

/** R-LAND-04: the owner clicked the button of the confirmation mail. Idempotent: the first confirmation date is kept. */
export async function confirmWaitlist(deps: Pick<WaitlistDeps, "db" | "secret" | "nowSec">, token: unknown): Promise<"ok" | "invalid" | "failed"> {
  const data = openWaitlistToken("confirm", token, deps.secret, deps.nowSec?.());
  if (!data) return "invalid";
  const { error } = await deps.db.from("waitlist").upsert({ email: data.email, locale: data.locale }, { onConflict: "email", ignoreDuplicates: true });
  return error ? "failed" : "ok";
}

/** R-LAND-07: removal. `ok` whatever the row count, so the page never tells whether the address was listed. */
export async function leaveWaitlist(deps: Pick<WaitlistDeps, "db" | "secret" | "nowSec">, token: unknown): Promise<"ok" | "invalid" | "failed"> {
  const data = openWaitlistToken("leave", token, deps.secret, deps.nowSec?.());
  if (!data) return "invalid";
  const { error } = await deps.db.from("waitlist").delete().eq("email", data.email);
  return error ? "failed" : "ok";
}

/** For the token pages: the address and language behind a token, or null. */
export function readWaitlistToken(purpose: WaitlistPurpose, token: unknown, secret: string | undefined, nowSec?: number) {
  return openWaitlistToken(purpose, token, secret, nowSec);
}

/** A fresh leave link for the same address; with `base = ""` it is relative and stays on the current host. */
export function leaveUrlFor(base: string, email: string, locale: Locale, secret: string | undefined): string {
  return `${base}/notify/leave/${sealWaitlistToken("leave", email, locale, secret, WAITLIST_LEAVE_TTL_SECONDS)}`;
}
