/**
 * `tsx scripts/show-revisions.ts [--all]`: read-only view of the shadow revisions (D44, R-KB-06), service role from
 * .env.local. Nothing is written. By default only the rows that need a human look (findings, refused findings, errors)
 * are listed; `--all` lists every row. The summary at the end counts everything, so "no finding" rows still show.
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

interface Finding {
  kind: "revise" | "contradiction";
  existing: string;
  incoming: string;
  incomingOrigin: "source" | "model";
  revised: string | null;
  reason: string;
}
interface Row {
  created_at: string;
  prompt_version: string;
  reasoning: string | null;
  findings: Finding[];
  rejected: { why?: string; reason?: string }[];
  would_do: { kind: string }[];
  error: string | null;
  page: { title: string } | null;
  capture: { subject: string | null } | null;
}

const { data, error } = await db
  .from("revision_shadow")
  .select("created_at,prompt_version,reasoning,findings,rejected,would_do,error,page:page(title),capture:capture(subject)")
  .order("created_at", { ascending: false })
  .limit(200);
if (error) throw new Error(error.message);
const rows = (data ?? []) as unknown as Row[];

for (const r of rows) {
  const interesting = r.findings.length || r.rejected.length || r.error;
  if (!all && !interesting) continue;
  console.log(`\n${r.created_at}  page "${r.page?.title ?? "?"}"  source "${r.capture?.subject ?? "?"}"  (revise/${r.prompt_version})`);
  if (r.error) console.log(`  ERROR: ${r.error}`);
  for (const f of r.findings) {
    console.log(`  ${f.kind.toUpperCase()}  [new claim origin: ${f.incomingOrigin}]\n    page says: ${f.existing}\n    new source: ${f.incoming}${f.revised ? `\n    proposed text: ${f.revised}` : ""}\n    why: ${f.reason}`);
  }
  if (r.would_do.length) console.log(`  a real run would: ${r.would_do.map((e) => e.kind).join(", ")}`);
  for (const x of r.rejected) console.log(`  refused: ${x.why ?? "?"}`);
  if (all && !interesting) console.log(`  no finding. ${r.reasoning ?? ""}`);
}

const count = (p: (r: Row) => boolean) => rows.filter(p).length;
console.log(
  `\nSummary (latest ${rows.length} rows): with findings ${count((r) => r.findings.length > 0)}, ` +
    `contradictions ${rows.reduce((n, r) => n + r.findings.filter((f) => f.kind === "contradiction").length, 0)}, ` +
    `revisions ${rows.reduce((n, r) => n + r.findings.filter((f) => f.kind === "revise").length, 0)}, ` +
    `would hit a live card ${count((r) => r.would_do.some((e) => e.kind === "card_update_proposed"))}, ` +
    `refused ${count((r) => r.rejected.length > 0)}, errors ${count((r) => !!r.error)}, no finding ${count((r) => !r.findings.length && !r.error)}.`,
);
