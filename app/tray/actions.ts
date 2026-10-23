"use server";

import { revalidatePath } from "next/cache";
import { FSRS_VERSION } from "@/domain/scheduling";
import { createSessionClient } from "@/supabase/server";

const UUID = /^[0-9a-f-]{36}$/;

function ids(formData: FormData): string[] {
  return formData.getAll("card_id").map(String).filter((v) => UUID.test(v));
}

/** Keep / discard run as the signed-in user: the SQL functions check ownership with auth.uid() (R-SEC-01). */
export async function keepCards(formData: FormData): Promise<void> {
  const list = ids(formData);
  if (!list.length) return;
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("keep_cards", { p_ids: list, p_fsrs_version: FSRS_VERSION });
  if (error) throw new Error(`keep_cards: ${error.message}`);
  revalidatePath("/tray");
  revalidatePath("/");
}

export async function discardCards(formData: FormData): Promise<void> {
  const list = ids(formData);
  if (!list.length) return;
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("discard_cards", { p_ids: list });
  if (error) throw new Error(`discard_cards: ${error.message}`);
  revalidatePath("/tray");
  revalidatePath("/");
}
