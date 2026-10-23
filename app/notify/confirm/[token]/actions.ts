"use server";

import { redirect } from "next/navigation";
import { confirmWaitlist } from "@/server/waitlist";
import { createAdminClient } from "@/supabase/admin";

/** R-LAND-04: the owner pressed the button. Writes only here, never on the page load. */
export async function confirmAction(token: string): Promise<void> {
  const result = await confirmWaitlist({ db: createAdminClient(), secret: process.env.REVIEW_LINK_SECRET }, token);
  redirect(`/notify/confirm/${encodeURIComponent(token)}?${result === "ok" ? "done=1" : result === "failed" ? "failed=1" : ""}`);
}
