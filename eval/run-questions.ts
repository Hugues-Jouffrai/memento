/**
 * `pnpm eval:questions [--only id,id]`
 * Runs the claims stage (prompt claims/v4) with the live provider over the long fixtures of eval/fixtures and prints the open
 * questions each one raises, with the mechanical defects. Read them: a question that one of the claims answers is a failure.
 * Exit code 1 on a mechanical defect.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createDefaultGateway } from "../src/ai/factory";
import { createMemorySink } from "../src/ai/sinks";
import { extractClaims } from "../src/server/stages";
import type { PipelineDeps } from "../src/server/ports";
import { questionDefects } from "./questions";

const { values } = parseArgs({ options: { only: { type: "string" } } });
try {
  process.loadEnvFile(".env.local");
} catch {
  // The key may come from the environment.
}
const dir = path.join(process.cwd(), "eval", "fixtures");
const only = values.only?.split(",");
const sink = createMemorySink();
const ai = createDefaultGateway(sink, process.env, { transientDelaysMs: [5000, 15000, 30000, 60000] });
const deps = { ai } as unknown as PipelineDeps;
let defects = 0;
let withQuestions = 0;
let total = 0;
for (const id of readdirSync(dir).sort()) {
  const file = path.join(dir, id, "input.md");
  if (!existsSync(file) || (only && !only.includes(id))) continue;
  const text = readFileSync(file, "utf8").trim().slice(0, 30000);
  if (text.length < 1500) continue; // a short note goes through enrichment, which raises no question
  total++;
  try {
    const out = await extractClaims(deps, "eval", text, "");
    const qs = out.questions ?? [];
    if (qs.length) withQuestions++;
    console.log(`\n## ${id}: ${out.claims.length} claims, ${qs.length} question(s)`);
    for (const q of qs) {
      const d = questionDefects(q);
      if (d.length) defects++;
      console.log(`- ${q}${d.length ? `   [DEFECT: ${d.join(", ")}]` : ""}`);
    }
    if (qs.length) console.log(`  claims: ${out.claims.map((c) => c.text).join(" | ")}`);
  } catch (err) {
    console.log(`\n## ${id}: failed (${err instanceof Error ? err.message : err})`);
  }
}
const cost = sink.calls.reduce((n, c) => n + (c.costUsd ?? 0), 0);
console.log(`\n${total} long sources, ${withQuestions} raised questions, ${defects} mechanical defect(s). Cost $${cost.toFixed(4)}.`);
process.exitCode = defects > 0 ? 1 : 0;
