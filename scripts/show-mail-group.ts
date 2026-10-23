/** `tsx scripts/show-mail-group.ts`: read-only state of the latest mail group (captures, jobs, receipts). */
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

const { data: caps } = await db.from("capture").select("id,parent_id,position,status,subject,error,notes,created_at").order("created_at", { ascending: false }).limit(4);
for (const c of caps ?? []) {
  console.log(`${c.created_at} #${c.position} ${c.status} parent=${c.parent_id ?? "-"} "${c.subject}" error=${c.error ?? "-"} notes=${JSON.stringify(c.notes).slice(0, 160)}`);
  const { data: jobs } = await db.from("job").select("stage,status,attempts,error,run_after").eq("capture_id", c.id).order("created_at");
  for (const j of jobs ?? []) console.log(`   job ${j.stage} ${j.status} attempts=${j.attempts} ${j.error ? "error=" + String(j.error).slice(0, 150) : ""}`);
}
const { data: mails } = await db.from("email_out").select("created_at,subject,status,error").order("created_at", { ascending: false }).limit(3);
console.log("\nemail_out:", mails);
