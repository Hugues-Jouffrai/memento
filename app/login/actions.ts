"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseCode, parseEmail, parseRetrySeconds, safeNext } from "@/server/auth";
import { createSessionClient } from "@/supabase/server";

const PENDING = "login_email";

export type LoginState = { error?: "invalid_email" | "invalid_code" | "rate_limited" | "bad_code"; seconds?: number };

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Step 1: ask Supabase to mail a link + 6-digit code. The answer never reveals whether the account exists. */
export async function requestCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = parseEmail(form.get("email"));
  if (!email) return { error: "invalid_email" };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await origin()}/auth/callback` },
  });
  if (error?.status === 429) return { error: "rate_limited", seconds: parseRetrySeconds(error.message) };
  (await cookies()).set(PENDING, email, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 900, path: "/login" });
  redirect("/login?step=code");
}

/** Step 2: verify the 6-digit code typed into the app (single use, expires with the OTP). */
export async function verifyCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const store = await cookies();
  const email = parseEmail(store.get(PENDING)?.value);
  if (!email) redirect("/login?step=code"); // no cookie (other tab or browser): the page asks for address and code
  const code = parseCode(form.get("code"));
  if (!code) return { error: "invalid_code" };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) return { error: "bad_code" };
  store.delete(PENDING);
  redirect(safeNext(form.get("next")));
}

/**
 * After a magic link failed in another browser (the usual in-app browsers case): the mail already holds a valid code,
 * so one form takes the address and that code. Same single-use code, same answer for any failure.
 */
export async function verifyEmailAndCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = parseEmail(form.get("email"));
  if (!email) return { error: "invalid_email" };
  const code = parseCode(form.get("code"));
  if (!code) return { error: "invalid_code" };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) return { error: "bad_code" };
  redirect(safeNext(form.get("next")));
}

export async function signOut(): Promise<void> {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/login");
}
