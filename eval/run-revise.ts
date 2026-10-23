/**
 * `pnpm eval:revise [--label name] [--model m] [--prompt v1]`
 * Runs eval/revise-fixtures/cases.yaml with the live provider and writes eval/reports/<stamp>-revise-<label>.md.
 * Gate: 0 false findings and 0 false resolves; exit code 1 otherwise.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createDefaultGateway } from "../src/ai/factory";
import { createMemorySink } from "../src/ai/sinks";
import { loadReviseCases, renderReviseMarkdown, runReviseEval } from "./revise";

const { values } = parseArgs({ options: { label: { type: "string", default: "default" }, model: { type: "string" }, prompt: { type: "string" } } });
try {
  process.loadEnvFile(".env.local");
} catch {
  // The key may come from the environment.
}
const root = path.join(process.cwd(), "eval");
const cases = loadReviseCases(path.join(root, "revise-fixtures", "cases.yaml"));
const sink = createMemorySink();
const ai = createDefaultGateway(sink, process.env, { transientDelaysMs: [5000, 15000, 30000, 60000] });
const label = values.label ?? "default";
console.log(`Revise eval: ${cases.length} cases (${label})...`);
const run = await runReviseEval({ cases, ai, sink, model: values.model, promptVersion: values.prompt });
const md = renderReviseMarkdown(label, run);
const file = path.join(root, "reports", `${new Date().toISOString().replace(/[:.]/g, "-")}-revise-${label}.md`);
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, md);
console.log(md);
console.log(`Report: ${path.relative(process.cwd(), file)}`);
process.exitCode = run.falseFindings.length + run.falseResolves.length > 0 ? 1 : 0;
