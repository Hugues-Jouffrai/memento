/** `tsx scripts/show-matches.ts`: read-only view of the latest topic-matching decisions and the pages they produced (service role). */
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

const { data: log, error } = await db.from("match_log").select("created_at,decision,confidence,reasoning,candidates,page_id,capture:capture(subject)").order("created_at", { ascending: false }).limit(10);
if (error) throw new Error(error.message);
for (const m of log ?? []) {
  const cands = (m.candidates as { title: string; similarity: number }[]).map((c) => `${c.title} ${c.similarity}`).join("; ");
  console.log(`${m.created_at} "${(m.capture as unknown as { subject: string } | null)?.subject}" -> ${m.decision} (conf ${m.confidence}) page=${m.page_id ?? "-"}\n  candidates: ${cands || "-"}\n  reasoning: ${m.reasoning}`);
}
const { data: pages } = await db.from("page").select("id,title,created_at").order("created_at", { ascending: false }).limit(12);
console.log("\nPages:");
for (const p of pages ?? []) {
  const { count } = await db.from("source_page").select("source_id", { count: "exact", head: true }).eq("page_id", p.id);
  console.log(`- ${p.title} (${count} source(s))`);
}
