import { remindersAllowed } from "@/domain/reminder-pref";
import { createReviewToken, createUnsubscribeToken } from "./review-token";
import { summarize } from "./review-queue";
import { buildReminderMail } from "./emails";
import { sendEmailOnce } from "./outbox";
import type { PipelineDeps } from "./ports";
import type { JobRow } from "./stages";

/**
 * R-NOT-01: sends the reminder only if there is something to do: cards due, new cards, or a tray waiting.
 * The (user, local date) key guarantees one reminder per day (R-NOT-03).
 */
export async function reminderStage(deps: PipelineDeps, job: JobRow): Promise<void> {
  const localDate = String(job.payload.local_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new Error("reminder job without local_date");
  const { data: pref } = await deps.db.from("profile").select("reminders_off,reminders_paused_until").eq("user_id", job.user_id).single();
  if (pref && !remindersAllowed(pref, deps.now())) return; // R-NOT-04: paused or unsubscribed
  const s = await summarize(deps.db, job.user_id, deps.now());
  const todo = s.dueReviews + s.newToday;
  if (todo === 0 && s.trayCount === 0) return;

  const token = createReviewToken(job.user_id, deps.reviewLinkSecret);
  const link = `${deps.appUrl}/r/${token}`;
  const unsubscribeUrl = `${deps.appUrl}/u/${createUnsubscribeToken(job.user_id, deps.reviewLinkSecret)}`;
  const oneClickUrl = `${deps.appUrl}/api/unsubscribe/${unsubscribeUrl.split("/u/")[1]}`;
  await sendEmailOnce(deps, {
    userId: job.user_id,
    kind: "reminder",
    dedupKey: localDate,
    build: (lang) => buildReminderMail(lang, { todo, minutes: s.minutes, trayCount: s.trayCount, reviewUrl: link, unsubscribeUrl, oneClickUrl }),
  });
}
