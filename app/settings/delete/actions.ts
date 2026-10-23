"use server";

import { redirect } from "next/navigation";
import { deleteAccount } from "@/server/account";
import { createAdminClient } from "@/supabase/admin";
import { createSessionClient } from "@/supabase/server";

/** R-SEC-06: deletes the account for good. The user must type their own address; a link-only session cannot get here. */
export async function removeAccount(formData: FormData): Promise<void> {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) redirect("/login");
  const typed = String(formData.get("email") ?? "").trim().toLowerCase();
  if (typed !== data.user.email.trim().toLowerCase()) redirect("/settings/delete?error=mismatch");
  await deleteAccount(createAdminClient(), data.user.id, data.user.email);
  await supabase.auth.signOut();
  redirect("/login?deleted=1");
}
