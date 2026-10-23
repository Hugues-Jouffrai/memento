/** `tsx scripts/show-capture-auth.ts [n]`: read-only, the last n captures with route, DKIM/SPF/DMARC result, recipient and status (service role). */
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

const n = Number(process.argv[2] ?? 8);
const { data, error } = await db
  .from("capture")
  .select("created_at,status,route,auth,from_address,subject,error,raw")
  .order("created_at", { ascending: false })
  .limit(n);
if (error) throw new Error(error.message);
for (const c of data ?? []) {
  const raw = c.raw as { data?: { to?: string[] } } | null;
  const to = (raw?.data?.to ?? []).map((a) => a.replace(/^[0-9a-f]{20}@/i, "<token>@")).join(",");
  console.log(`${c.created_at} ${c.status} route=${c.route} to=${to} from=${c.from_address} "${c.subject}" auth=${JSON.stringify(c.auth)}${c.error ? ` error=${c.error}` : ""}`);
}
