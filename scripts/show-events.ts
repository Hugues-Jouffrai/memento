/** `tsx scripts/show-events.ts`: read-only view of the latest event_log rows (what each capture changed). */
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

const { data, error } = await db.from("event_log").select("created_at,kind,detail,page:page(title),capture:capture(subject)").order("created_at", { ascending: false }).limit(25);
if (error) throw new Error(error.message);
for (const e of (data ?? []).reverse()) {
  console.log(`${e.created_at} ${e.kind} "${(e.page as unknown as { title: string } | null)?.title}" <- "${(e.capture as unknown as { subject: string } | null)?.subject}" ${JSON.stringify(e.detail).slice(0, 120)}`);
}
