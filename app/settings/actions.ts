"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentChoice, isReminderChoice, reminderUpdate } from "@/domain/reminder-pref";
import { validateSettings, type SettingsField } from "@/domain/settings";
import { sessionViewer } from "@/server/viewer";
import { createSessionClient } from "@/supabase/server";

/**
 * R-ACC-05, R-ACC-06, R-ACC-08: one form saves the settings and the reminder option together. It validates on the
 * server, then writes as the signed-in user (RLS plus the column CHECKs are the second guard). A rejected form
 * changes nothing. The reminder option only writes when it differs from the one in force (D58).
 */
export async function saveSettings(formData: FormData): Promise<void> {
  const viewer = await sessionViewer();
  if (!viewer) redirect("/login");
  const result = validateSettings({
    daily_minutes: formData.get("daily_minutes"),
    study_days: formData.getAll("study_day"),
    max_new_cards: formData.get("max_new_cards"),
    desired_retention: formData.get("desired_retention"),
    timezone: formData.get("timezone"),
    language: formData.get("language"),
  });
  const choice = formData.get("reminders");
  const errors: (SettingsField | "reminders")[] = result.ok ? [] : [...result.errors];
  if (!isReminderChoice(choice)) errors.push("reminders");
  if (!result.ok || !isReminderChoice(choice)) redirect(`/settings?error=${errors.join(",")}`);

  const supabase = await createSessionClient();
  const { data: pref } = await supabase.from("profile").select("reminders_off,reminders_paused_until").eq("user_id", viewer.userId).single();
  const now = new Date();
  const reminders = reminderUpdate(choice, currentChoice(pref ?? { reminders_off: false, reminders_paused_until: null }, now), now);
  const { error } = await supabase
    .from("profile")
    .update({ ...result.value, ...(reminders ?? {}) })
    .eq("user_id", viewer.userId);
  if (error) throw new Error(`save settings: ${error.message}`);
  (await cookies()).set("locale", result.value.language, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}
