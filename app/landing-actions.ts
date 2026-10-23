"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, pickLocale } from "@/i18n/locale";
import { appUrl } from "@/server/config";
import { requestMailer } from "@/server/mailpit";
import { requestWaitlist } from "@/server/waitlist";
import { createAdminClient } from "@/supabase/admin";

/** R-LAND-03: the notify-me form. Works without JavaScript (post, then redirect with the result state only). */
export async function joinWaitlist(form: FormData): Promise<void> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  const locale = pickLocale((await cookies()).get("locale")?.value);
  const result = await requestWaitlist(
    { db: createAdminClient(), mailer: requestMailer(), appUrl: appUrl(), secret: process.env.REVIEW_LINK_SECRET },
    { email: form.get("email"), honeypot: form.get("hp_note"), ip, locale },
  );
  redirect(`/?notify=${result}`);
}

/** R-LAND-10: the visitor's FR/EN switch; same cookie and options as Réglages, nothing else. */
export async function setVisitorLocale(form: FormData): Promise<void> {
  const v = form.get("locale");
  if (typeof v === "string" && isLocale(v)) (await cookies()).set("locale", v, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  redirect("/");
}
