/**
 * `pnpm eval:files [--label name] [--only id,id]`
 * Runs the attachment track (PDF and image fixtures, eval/file-fixtures) with the live provider and writes
 * eval/reports/<stamp>-files-<label>.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createDefaultGateway } from "../src/ai/factory";
import { createMemorySink } from "../src/ai/sinks";
import { loadFileFixtures, renderFileMarkdown, runFileEval } from "./files";

const { values } = parseArgs({ options: { label: { type: "string", default: "default" }, only: { type: "string" } } });

try {
  process.loadEnvFile(".env.local");
} catch {
  // The key may come from the environment.
}

const root = path.join(process.cwd(), "eval");
const only = values.only?.split(",");
const fixtures = loadFileFixtures(path.join(root, "file-fixtures")).filter((f) => !only || only.includes(f.id));
const sink = createMemorySink();
const ai = createDefaultGateway(sink, process.env, { transientDelaysMs: [5000, 15000, 30000, 60000] });
const label = values.label ?? "default";

console.log(`Running ${fixtures.length} file fixtures (${label})...`);
const results = await runFileEval({ fixtures, ai, sink });
const md = renderFileMarkdown(label, results, fixtures);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = path.join(root, "reports", `${stamp}-files-${label}.md`);
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, md);
console.log(md.split("\n## ")[0]);
console.log(`Report: ${path.relative(process.cwd(), file)}`);
process.exitCode = results.some((r) => r.status === "failed" || !r.routeOk || r.transcribeMissing.length > 0) ? 1 : 0;
