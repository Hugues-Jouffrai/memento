"use server";

import { redirect } from "next/navigation";
import { leaveWaitlist } from "@/server/waitlist";
import { createAdminClient } from "@/supabase/admin";

/** R-LAND-07: the owner pressed the button. Writes only here, never on the page load. */
export async function leaveAction(token: string): Promise<void> {
  const result = await leaveWaitlist({ db: createAdminClient(), secret: process.env.REVIEW_LINK_SECRET }, token);
  redirect(`/notify/leave/${encodeURIComponent(token)}?${result === "ok" ? "done=1" : result === "failed" ? "failed=1" : ""}`);
}
