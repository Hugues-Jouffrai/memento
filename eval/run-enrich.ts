/**
 * `pnpm eval:enrich [--label name] [--enrich-model m] [--cards-model m] [--judge-model m] [--only id,id]`
 * Runs the enrichment track (sparse note to claims to cards) with the live provider and writes
 * eval/reports/<stamp>-enrich-<label>.md. Use it to compare prompt versions and models.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createDefaultGateway } from "../src/ai/factory";
import { createMemorySink } from "../src/ai/sinks";
import { loadEnrichFixtures, renderEnrichMarkdown, runEnrichEval } from "./enrich";

const { values } = parseArgs({
  options: {
    label: { type: "string", default: "default" },
    "enrich-model": { type: "string" },
    "cards-model": { type: "string" },
    "judge-model": { type: "string" },
    "enrich-prompt": { type: "string" },
    "cards-prompt": { type: "string" },
    refine: { type: "boolean", default: false },
    only: { type: "string" },
  },
});

try {
  process.loadEnvFile(".env.local");
} catch {
  // The key may come from the environment.
}

const root = path.join(process.cwd(), "eval");
const only = values.only?.split(",");
const fixtures = loadEnrichFixtures(path.join(root, "enrich-fixtures")).filter((f) => !only || only.includes(f.id));
const sink = createMemorySink();
// Evals wait much longer than production for an overloaded model: a result is worth a minute.
const ai = createDefaultGateway(sink, process.env, { transientDelaysMs: [5000, 15000, 30000, 60000] });
const label = values.label ?? "default";

console.log(`Running ${fixtures.length} enrichment fixtures (${label})...`);
const results = await runEnrichEval({
  fixtures,
  ai,
  sink,
  models: {
    enrich: values["enrich-model"],
    cards: values["cards-model"],
    judge: values["judge-model"],
    enrichPrompt: values["enrich-prompt"],
    cardsPrompt: values["cards-prompt"],
    refine: values.refine,
  },
});
const md = renderEnrichMarkdown(label, results);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = path.join(root, "reports", `${stamp}-enrich-${label}.md`);
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, md);
console.log(md.split("\n## ")[0]);
console.log(`Report: ${path.relative(process.cwd(), file)}`);
process.exitCode = results.some((r) => r.status === "failed") ? 1 : 0;
