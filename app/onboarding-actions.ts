"use server";

import { revalidatePath } from "next/cache";
import { sessionViewer } from "@/server/viewer";
import { createSessionClient } from "@/supabase/server";

/** R-ONB-02: "Hide" is permanent for the account, on every device. */
export async function dismissOnboarding(): Promise<void> {
  const viewer = await sessionViewer();
  if (!viewer) return;
  const supabase = await createSessionClient();
  await supabase.from("profile").update({ onboarding_dismissed_at: new Date().toISOString() }).eq("user_id", viewer.userId);
  revalidatePath("/");
}
