import { AiOutputError } from "@/ai/gateway";
import { AI_STAGES } from "@/domain/cost-cap";
import { holdJob, userCapStatus } from "./cost-cap";
import { PermanentError, type FailureReason, type PipelineDeps } from "./ports";
import { failCapture, runStage, type JobRow } from "./stages";

export interface WorkerOptions {
  /** Stop claiming new jobs after this long. Vercel allows 300 s; we stop at 240 s (D17). */
  budgetMs?: number;
  batch?: number;
  leaseSeconds?: number;
}

export interface WorkerStats {
  claimed: number;
  done: number;
  retried: number;
  failed: number;
  /** Held by the per-user cost cap, to be run later (D53). */
  deferred: number;
}

function reasonFor(job: JobRow, err: unknown): FailureReason {
  if (err instanceof PermanentError) return err.reason;
  if (job.stage === "fetch") return "fetch_error";
  if (err instanceof AiOutputError || job.stage === "extract" || job.stage === "cards") return "ai_error";
  return "unknown";
}

/** Drains due jobs: claim, run the stage, complete or fail with back-off (D17, R-PIPE-01). */
export async function runWorker(deps: PipelineDeps, opts: WorkerOptions = {}): Promise<WorkerStats> {
  const { budgetMs = 240_000, batch = 5, leaseSeconds = 180 } = opts;
  const started = deps.now().getTime();
  const stats: WorkerStats = { claimed: 0, done: 0, retried: 0, failed: 0, deferred: 0 };

  // Jobs that died on their last attempt: end the capture with a receipt.
  const { data: dead } = await deps.db.rpc("sweep_dead_jobs");
  for (const job of (dead ?? []) as JobRow[]) {
    stats.failed++;
    if (job.capture_id) await failCapture(deps, job.capture_id, reasonFor(job, null), "worker lease expired").catch(console.error);
  }

  while (deps.now().getTime() - started < budgetMs) {
    const { data, error } = await deps.db.rpc("claim_jobs", { p_limit: batch, p_lease_seconds: leaseSeconds });
    if (error) throw new Error(`claim_jobs: ${error.message}`);
    const jobs = (data ?? []) as JobRow[];
    if (!jobs.length) break;
    for (const job of jobs) {
      stats.claimed++;
      if (job.user_id && AI_STAGES.has(job.stage)) {
        const cap = await userCapStatus(deps, job.user_id);
        if (cap.held) {
          await holdJob(deps, { id: job.id, user_id: job.user_id }, cap);
          stats.deferred++;
          continue;
        }
      }
      try {
        await runStage(deps, job);
        await deps.db.rpc("complete_job", { p_id: job.id });
        stats.done++;
      } catch (err) {
        if (err instanceof PermanentError) {
          await deps.db.rpc("complete_job", { p_id: job.id });
          if (job.capture_id) await failCapture(deps, job.capture_id, err.reason).catch(console.error);
          stats.failed++;
          continue;
        }
        const { data: status } = await deps.db.rpc("fail_job", { p_id: job.id, p_error: String(err) });
        if (status === "failed") {
          stats.failed++;
          if (job.capture_id) await failCapture(deps, job.capture_id, reasonFor(job, err), String(err)).catch(console.error);
        } else {
          stats.retried++;
        }
      }
    }
  }
  return stats;
}
