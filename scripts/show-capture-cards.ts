/** `tsx scripts/show-capture-cards.ts <capture-id>`: prints claims, cards and the AI calls of one capture (service role, read-only). */
import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may come from the environment.
}
const id = process.argv[2];
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!id || !url || !key) throw new Error("usage: show-capture-cards.ts <capture-id> (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required)");
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: sources } = await db.from("source").select("id").eq("capture_id", id);
const { data: pages } = await db.from("page").select("id").in("source_id", (sources ?? []).map((s) => s.id));
const { data: claims } = await db.from("claim").select("id,origin,text").in("page_id", (pages ?? []).map((p) => p.id)).order("created_at");
console.log("Claims:");
for (const c of claims ?? []) console.log(`- [${c.origin}] ${c.text}`);
const { data: cards } = await db.from("card").select("question,answer,status").in("claim_id", (claims ?? []).map((c) => c.id));
console.log("\nCards:");
for (const c of cards ?? []) console.log(`- (${c.status}) Q: ${c.question}\n  A: ${c.answer}`);
const { data: calls } = await db.from("ai_call").select("at,stage,model,status,cost_usd").gte("at", new Date(Date.now() - 20 * 60_000).toISOString()).order("at");
console.log("\nAI calls:", calls);
