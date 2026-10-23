/**
 * `pnpm eval:link [--label name] [--model m] [--prompt v1] [--runs 3]`
 * Runs eval/link-fixtures/cases.yaml with the live provider and writes eval/reports/<stamp>-link-<label>.md.
 * Gate: 0 false links on every run; exit code 1 otherwise.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createDefaultGateway } from "../src/ai/factory";
import { createMemorySink } from "../src/ai/sinks";
import { loadLinkCases, renderLinkMarkdown, runLinkEval } from "./link";

const { values } = parseArgs({ options: { label: { type: "string", default: "default" }, model: { type: "string" }, prompt: { type: "string" }, runs: { type: "string", default: "1" } } });
try {
  process.loadEnvFile(".env.local");
} catch {
  // The key may come from the environment.
}
const root = path.join(process.cwd(), "eval");
const cases = loadLinkCases(path.join(root, "link-fixtures", "cases.yaml"));
const label = values.label ?? "default";
const runs = Math.max(1, Number(values.runs) || 1);
console.log(`Link eval: ${cases.length} cases, ${runs} run(s) (${label})...`);
let falseLinks = 0;
const parts: string[] = [];
for (let i = 1; i <= runs; i++) {
  const sink = createMemorySink();
  const ai = createDefaultGateway(sink, process.env, { transientDelaysMs: [5000, 15000, 30000, 60000] });
  const run = await runLinkEval({ cases, ai, sink, model: values.model, promptVersion: values.prompt });
  falseLinks += run.falseLinks.length;
  parts.push(renderLinkMarkdown(`${label} run ${i}/${runs}`, run));
}
const md = parts.join("\n");
const file = path.join(root, "reports", `${new Date().toISOString().replace(/[:.]/g, "-")}-link-${label}.md`);
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, md);
console.log(md);
console.log(`Report: ${path.relative(process.cwd(), file)}`);
process.exitCode = falseLinks > 0 ? 1 : 0;
