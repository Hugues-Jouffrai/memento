/** `tsx scripts/show-activity.ts`: read-only summary of recent outbound mails and captures (service role). */
import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may come from the environment.
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: mails, error: e1 } = await db.from("email_out").select("created_at,kind,dedup_key,status,subject,error").order("created_at", { ascending: false }).limit(12);
if (e1) throw new Error(e1.message);
console.log("email_out:");
for (const m of mails ?? []) console.log(`- ${m.created_at} ${m.kind} ${m.status} "${m.subject}" key=${m.dedup_key}${m.error ? ` error=${m.error}` : ""}`);

const { data: caps, error: e2 } = await db.from("capture").select("created_at,status,from_address,subject,error,raw").order("created_at", { ascending: false }).limit(12);
if (e2) throw new Error(e2.message);
console.log("\ncapture:");
for (const c of caps ?? []) {
  const raw = c.raw as { data?: { attachments?: { filename?: string; content_type?: string }[] } } | null;
  const att = (raw?.data?.attachments ?? []).map((a) => `${a.filename}(${a.content_type})`).join(",");
  console.log(`- ${c.created_at} ${c.status} from=${c.from_address} "${c.subject}"${att ? ` att=${att}` : ""}${c.error ? ` error=${c.error}` : ""}`);
}

const { data: jobs } = await db.from("job").select("created_at,stage,status,attempts,error").eq("stage", "reminder").order("created_at", { ascending: false }).limit(5);
console.log("\nreminder jobs:", jobs);
