import { capStatus, holdUntil, type CapStatus } from "@/domain/cost-cap";
import { buildQuotaNotice } from "./emails";
import { sendEmailOnce } from "./outbox";
import type { PipelineDeps } from "./ports";

/** Reads what the user spent and their limits (D53). A read failure lets the job run: the global switch still stands. */
export async function userCapStatus(deps: PipelineDeps, userId: string): Promise<CapStatus> {
  const [spend, prof] = await Promise.all([
    deps.db.rpc("ai_spend", { p_user_id: userId }),
    deps.db.from("profile").select("ai_cap_day_usd,ai_cap_month_usd").eq("user_id", userId).single(),
  ]);
  const row = (spend.data as { day_usd: number | string; month_usd: number | string }[] | null)?.[0];
  if (spend.error || prof.error || !row || !prof.data) return { held: false };
  return capStatus(
    { dayUsd: Number(row.day_usd), monthUsd: Number(row.month_usd) },
    { dayUsd: Number(prof.data.ai_cap_day_usd), monthUsd: Number(prof.data.ai_cap_month_usd) },
  );
}

/** Puts the job back without using an attempt, and tells the user once a day. */
export async function holdJob(deps: PipelineDeps, job: { id: string; user_id: string }, status: Extract<CapStatus, { held: true }>): Promise<void> {
  await deps.db.rpc("defer_job", { p_id: job.id, p_until: holdUntil(deps.now()).toISOString() });
  await sendEmailOnce(deps, {
    userId: job.user_id,
    kind: "quota",
    dedupKey: deps.now().toISOString().slice(0, 10),
    build: (lang) => buildQuotaNotice(lang, status.window),
  }).catch(console.error);
}
