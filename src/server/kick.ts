import { appUrl } from "./config";

/** Starts the worker right after an enqueue. Best effort: the pg_cron backstop picks up anything missed. */
export async function kickWorker(): Promise<void> {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return;
  try {
    await fetch(`${appUrl()}/api/worker`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
  } catch {
    // The backstop will retry within a minute.
  }
}
