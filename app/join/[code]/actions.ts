"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseEmail } from "@/server/auth";
import { joinWithInvite } from "@/server/join";
import { createAdminClient } from "@/supabase/admin";
import { createSessionClient } from "@/supabase/server";

export type JoinState = { error?: "invalid_email" | "invalid_invite" | "rate_limited" | "failed" };

/** Joins with the invite link of the page, then continues on the normal sign-in code screen. */
export async function join(code: string, _prev: JoinState, form: FormData): Promise<JoinState> {
  const email = parseEmail(form.get("email"));
  if (!email) return { error: "invalid_email" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");

  const result = await joinWithInvite(createAdminClient(), { code, email, ip }, async (to) => {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.signInWithOtp({ email: to, options: { shouldCreateUser: false, emailRedirectTo: `${proto}://${host}/auth/callback` } });
    if (error?.status === 429) return "rate_limited";
    return error ? "failed" : "ok";
  });
  if (result === "invalid") return { error: "invalid_invite" };
  if (result !== "sent") return { error: result };

  (await cookies()).set("login_email", email, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 900, path: "/login" });
  redirect("/login?step=code");
}
