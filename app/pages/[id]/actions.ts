"use server";

import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/supabase/server";

const UUID = /^[0-9a-f-]{36}$/;

function field(formData: FormData, name: string): string | null {
  const v = String(formData.get(name) ?? "");
  return UUID.test(v) ? v : null;
}

/** Remove a link (R-KB-13). The row stays with status "removed", so the link stage never proposes the pair again. Runs as the signed-in user: RLS and the column grant allow only the status of one's own rows. */
export async function removeLink(formData: FormData): Promise<void> {
  const linkId = field(formData, "link_id");
  const pageId = field(formData, "page_id");
  if (!linkId || !pageId) return;
  const supabase = await createSessionClient();
  const { error } = await supabase.from("page_link").update({ status: "removed" }).eq("id", linkId).eq("status", "active");
  if (error) throw new Error(`remove link: ${error.message}`);
  revalidatePath(`/pages/${pageId}`);
}

/** Mark an open question resolved or remove it (R-KB-14). */
async function closeQuestion(formData: FormData, status: "resolved" | "removed"): Promise<void> {
  const questionId = field(formData, "question_id");
  const pageId = field(formData, "page_id");
  if (!questionId || !pageId) return;
  const supabase = await createSessionClient();
  const { error } = await supabase.from("open_question").update({ status }).eq("id", questionId).eq("status", "open");
  if (error) throw new Error(`close question: ${error.message}`);
  revalidatePath(`/pages/${pageId}`);
}

export async function resolveQuestion(formData: FormData): Promise<void> {
  await closeQuestion(formData, "resolved");
}

export async function removeQuestion(formData: FormData): Promise<void> {
  await closeQuestion(formData, "removed");
}
