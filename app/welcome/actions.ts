"use server";

import { redirect } from "next/navigation";
import { sessionViewer } from "@/server/viewer";
import { createSessionClient } from "@/supabase/server";

/**
 * R-ONB-08, R-ONB-09: "Skip" and "Finish" mark the walkthrough done, once. The `is null` filter means a replay
 * never changes the stored date.
 */
export async function completeWelcome(): Promise<void> {
  const viewer = await sessionViewer();
  if (!viewer) redirect("/login");
  const supabase = await createSessionClient();
  await supabase.from("profile").update({ welcome_done_at: new Date().toISOString() }).eq("user_id", viewer.userId).is("welcome_done_at", null);
  redirect("/");
}
