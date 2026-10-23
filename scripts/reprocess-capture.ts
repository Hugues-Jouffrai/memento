/**
 * `tsx scripts/reprocess-capture.ts <capture-id> [--apply]`
 * Re-runs the pipeline on one capture: deletes its source (cascades page, claims, cards and
 * review history), its jobs and its receipt row, resets the capture and enqueues `fetch`.
 * Without --apply it only prints what it would delete. Uses the service role from .env.local.
 */
import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may come from the environment.
}

const id = process.argv[2];
const apply = process.argv.includes("--apply");
if (!id) throw new Error("usage: reprocess-capture.ts <capture-id> [--apply]");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const db = createClient(url, key, { auth: { persistSession: false } });
console.log(`Database host: ${new URL(url).host}`);

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  if (data == null) throw new Error("no data returned");
  return data;
}

const capture = await must(db.from("capture").select("id,user_id,subject,status,from_address,page,notes").eq("id", id).single());
console.log("capture:", { id: capture.id, subject: capture.subject, status: capture.status, hasPage: capture.page != null, notes: capture.notes });

const sources = await must(db.from("source").select("id,title,kind").eq("capture_id", id));
const sourceIds = sources.map((s) => s.id);
const pages = sourceIds.length ? await must(db.from("page").select("id,title").in("source_id", sourceIds)) : [];
const pageIds = pages.map((p) => p.id);
const claims = pageIds.length ? await must(db.from("claim").select("id").in("page_id", pageIds)) : [];
const cards = claims.length ? await must(db.from("card").select("id,status").in("claim_id", claims.map((c) => c.id))) : [];
const jobs = await must(db.from("job").select("id,stage,status").eq("capture_id", id));
const receipts = await must(db.from("email_out").select("id,kind,status").eq("user_id", capture.user_id).eq("dedup_key", `capture:${id}`));
const reviews = cards.length ? await must(db.from("review_log").select("id").in("card_id", cards.map((c) => c.id))) : [];
console.log({ sources, pages, claims: claims.length, cards, reviewLogRows: reviews.length, jobs, receipts });

if (!apply) {
  console.log("Dry run: nothing changed.");
  process.exit(0);
}

for (const sid of sourceIds) await must(db.from("source").delete().eq("id", sid).select("id"));
await must(db.from("job").delete().eq("capture_id", id).select("id"));
await must(db.from("email_out").delete().eq("user_id", capture.user_id).eq("dedup_key", `capture:${id}`).select("id"));
await must(db.from("capture").update({ status: "received", page: null, notes: {}, error: null }).eq("id", id).select("id"));
const jobId = await must(
  db.rpc("enqueue_job", { p_user_id: capture.user_id, p_capture_id: id, p_stage: "fetch", p_key: `reprocess:${id}:${Date.now()}`, p_payload: {} }),
);
console.log("Reset done, fetch job enqueued:", jobId);
