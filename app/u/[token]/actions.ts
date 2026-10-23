"use server";

import { redirect } from "next/navigation";
import { isReminderChoice, prefFor } from "@/domain/reminder-pref";
import { verifyUnsubscribeToken } from "@/server/review-token";
import { createAdminClient } from "@/supabase/admin";

/** R-NOT-04: the signed link in a reminder can only change that user's reminder preference. */
export async function chooseReminders(token: string, formData: FormData): Promise<void> {
  const userId = verifyUnsubscribeToken(token, process.env.REVIEW_LINK_SECRET);
  const choice = formData.get("choice");
  if (!userId || !isReminderChoice(choice)) redirect(`/u/${encodeURIComponent(token)}`);
  const { error } = await createAdminClient().from("profile").update(prefFor(choice, new Date())).eq("user_id", userId);
  if (error) throw new Error(`reminder preference: ${error.message}`);
  redirect(`/u/${encodeURIComponent(token)}?done=${choice}`);
}
