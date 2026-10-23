/**
 * `pnpm eval:match [--label name] [--match-model m] [--match-prompt v1] [--threshold 0.8] [--fresh]`
 * Runs the topic-matching sequence (eval/match-fixtures/sequence.yaml) with the live provider and writes
 * eval/reports/<stamp>-match-<label>.md. Extraction results are cached in eval/cache (use --fresh to redo them).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createDefaultGateway } from "../src/ai/factory";
import { createMemorySink } from "../src/ai/sinks";
import { MERGE_CONFIDENCE } from "../src/domain/matching";
import { loadSequence, renderMatchMarkdown, runMatchEval } from "./match";

const { values } = parseArgs({
  options: {
    label: { type: "string", default: "default" },
    "match-model": { type: "string" },
    "match-prompt": { type: "string" },
    threshold: { type: "string" },
    fresh: { type: "boolean", default: false },
  },
});

try {
  process.loadEnvFile(".env.local");
} catch {
  // The key may come from the environment.
}

const root = path.join(process.cwd(), "eval");
const cacheFile = path.join(root, "cache", "match-extract.json");
if (values.fresh) rmSync(cacheFile, { force: true });
const sequence = loadSequence(path.join(root, "match-fixtures", "sequence.yaml"));
const sink = createMemorySink();
const ai = createDefaultGateway(sink, process.env, { transientDelaysMs: [5000, 15000, 30000, 60000] });
const threshold = values.threshold ? Number(values.threshold) : MERGE_CONFIDENCE;
const label = values.label ?? "default";

console.log(`Matching ${sequence.sources.length} sources (${label})...`);
const run = await runMatchEval({ sequence, ai, sink, models: { match: values["match-model"], matchPrompt: values["match-prompt"], threshold, cacheFile } });
const md = renderMatchMarkdown(label, run, threshold);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = path.join(root, "reports", `${stamp}-match-${label}.md`);
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, md);
console.log(md.split("\n## ")[0]);
console.log(`Report: ${path.relative(process.cwd(), file)}`);
process.exitCode = run.score.falseMerges.length > 0 ? 1 : 0;
