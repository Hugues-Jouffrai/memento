"use server";

import { redirect } from "next/navigation";
import { FSRS_VERSION, applyReview, elapsedDays, type Grade } from "@/domain/scheduling";
import { loadProfile } from "@/server/review-queue";
import { reviewViewer, sessionViewer } from "@/server/viewer";
import { createAdminClient } from "@/supabase/admin";
import { createSessionClient } from "@/supabase/server";

const MAX_DURATION_MS = 120_000;

/** Grades the card shown. The state shown is re-read from the database and checked, so a double submit counts once. */
export async function gradeCard(formData: FormData): Promise<void> {
  const viewer = await reviewViewer();
  if (!viewer) redirect("/login");
  const cardId = String(formData.get("card_id") ?? "");
  const grade = Number(formData.get("grade"));
  if (![1, 2, 3, 4].includes(grade) || !/^[0-9a-f-]{36}$/.test(cardId)) redirect("/review");

  const db = createAdminClient();
  const { data: row } = await db
    .from("fsrs_state")
    .select("due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,state,last_review")
    .eq("card_id", cardId)
    .eq("user_id", viewer.userId)
    .single();
  if (!row) redirect("/review");

  const now = new Date();
  // `due` is passed back exactly as the database returned it: record_review compares it with the stored value
  // (microsecond precision), so it must not be re-serialised through a JS Date.
  const before = row as unknown as Parameters<typeof applyReview>[0];
  const profile = await loadProfile(db, viewer.userId);
  const after = applyReview(before, grade as Grade, now, profile.desired_retention);
  const shownAt = Number(formData.get("shown_at"));
  const duration = Number.isFinite(shownAt) ? Math.min(Math.max(now.getTime() - shownAt, 0), MAX_DURATION_MS) : null;

  const { error } = await db.rpc("record_review", {
    p_user_id: viewer.userId,
    p_card_id: cardId,
    p_grade: grade,
    p_at: now.toISOString(),
    p_duration_ms: duration,
    p_before: before,
    p_after: after,
    p_elapsed_days: elapsedDays(before.last_review, now),
    p_fsrs_version: FSRS_VERSION,
  });
  // 40001 = the card was already graded (double click or two tabs): just show the next one.
  if (error && error.code !== "40001") throw new Error(`record_review: ${error.message}`);
  // After "Again", show the claim and its source excerpt (R-REV-04).
  const keep = formData.get("continue") === "1";
  const query = new URLSearchParams();
  if (grade === 1) query.set("recall", cardId);
  if (keep) query.set("continue", "1");
  redirect(query.size ? `/review?${query}` : "/review");
}

const UUID = /^[0-9a-f-]{36}$/;

/** R-CARD-07: "stop asking this". Full sign-in only: the review link cannot change cards. */
export async function suspendCard(formData: FormData): Promise<void> {
  const viewer = await sessionViewer();
  if (!viewer) redirect("/login");
  const cardId = String(formData.get("card_id") ?? "");
  if (!UUID.test(cardId)) redirect("/review");
  const supabase = await createSessionClient();
  const { error } = await supabase.from("card").update({ status: "suspended" }).eq("id", cardId).eq("user_id", viewer.userId).eq("status", "active");
  if (error) throw new Error(`suspend card: ${error.message}`);
  redirect(formData.get("continue") === "1" ? "/review?continue=1" : "/review");
}

/** R-CARD-07 / R-CARD-06: a wording fix makes a new card version and keeps the review history (edit_card). */
export async function editCard(formData: FormData): Promise<void> {
  const viewer = await sessionViewer();
  if (!viewer) redirect("/login");
  const cardId = String(formData.get("card_id") ?? "");
  if (!UUID.test(cardId)) redirect("/review");
  const keep = formData.get("continue") === "1" ? "&continue=1" : "";
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("edit_card", {
    p_card_id: cardId,
    p_question: String(formData.get("question") ?? ""),
    p_answer: String(formData.get("answer") ?? ""),
  });
  if (error?.code === "22023") redirect(`/review?edit=${cardId}&error=1${keep}`);
  if (error) throw new Error(`edit_card: ${error.message}`);
  redirect(`/review?show=1${keep}`);
}
