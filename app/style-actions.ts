"use server";

import { cookies } from "next/headers";
import { isStyle, STYLE_COOKIE } from "@/ui/style";

/** Saves the chosen look in a cookie (a display preference only; it moves to the settings screen later). */
export async function setStyle(form: FormData) {
  const style = form.get("style");
  if (typeof style !== "string" || !isStyle(style)) return;
  (await cookies()).set(STYLE_COOKIE, style, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}
