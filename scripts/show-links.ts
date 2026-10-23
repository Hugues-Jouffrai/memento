/**
 * `tsx scripts/show-links.ts [--all]`: read-only view of the link stage's shadow log (D66, R-KB-12), service role from
 * .env.local. Nothing is written. By default only the rows with a proposed, refused or failed link are listed; `--all`
 * lists every row. The summary at the end counts everything. Judge false links first: a wrong link is shown on two pages.
 */
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
const all = process.argv.includes("--all");

interface Row {
  created_at: string;
  mode: string;
  prompt_version: string;
  reasoning: string | null;
  candidates: { title: string; similarity: number }[];
  accepted: { title: string; reason: string; confidence: number }[];
  rejected: { why?: string; candidate?: number | string; confidence?: number }[];
  error: string | null;
  capture: { subject: string | null } | null;
}

const { data, error } = await db
  .from("link_shadow")
  .select("created_at,mode,prompt_version,reasoning,candidates,accepted,rejected,error,capture:capture(subject)")
  .order("created_at", { ascending: false })
  .limit(200);
if (error) throw new Error(error.message);
const rows = (data ?? []) as unknown as Row[];

for (const r of rows) {
  const interesting = r.accepted.length || r.rejected.length || r.error;
  if (!all && !interesting) continue;
  console.log(`\n${r.created_at}  source "${r.capture?.subject ?? "?"}"  [${r.mode}]  (link/${r.prompt_version})`);
  console.log(`  shown: ${r.candidates.map((c) => `${c.title} (${c.similarity})`).join(", ") || "none"}`);
  if (r.error) console.log(`  ERROR: ${r.error}`);
  for (const l of r.accepted) console.log(`  LINK -> ${l.title}  (${l.confidence})\n    why: ${l.reason}`);
  for (const x of r.rejected) console.log(`  refused: ${x.why ?? "?"}`);
  if (all && !interesting) console.log(`  no link. ${r.reasoning ?? ""}`);
}

const count = (p: (r: Row) => boolean) => rows.filter(p).length;
console.log(
  `\nSummary (latest ${rows.length} rows): with links ${count((r) => r.accepted.length > 0)}, links ${rows.reduce((n, r) => n + r.accepted.length, 0)}, ` +
    `refused ${count((r) => r.rejected.length > 0)}, errors ${count((r) => !!r.error)}, no link ${count((r) => !r.accepted.length && !r.error)}.`,
);
