import { createSessionClient } from "@/supabase/server";
import { helpArgs, sendingAddress } from "./help-page";

/** What `/help` and the walkthrough both need: the user's sending address and the arguments for the `help` messages. */
export async function loadHelpContext(userId: string) {
  const supabase = await createSessionClient();
  const [{ data: auth }, { data: addr }, { data: prof }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("capture_address").select("token").maybeSingle(),
    supabase.from("profile").select("reminder_time,daily_minutes").eq("user_id", userId).single(),
  ]);
  const address = sendingAddress((addr?.token as string | undefined) ?? null);
  const args = await helpArgs({
    address,
    accountEmail: auth.user?.email ?? "",
    reminderTime: String(prof?.reminder_time ?? "18:00"),
    dailyMinutes: Number(prof?.daily_minutes ?? 10),
  });
  return { address, args };
}
