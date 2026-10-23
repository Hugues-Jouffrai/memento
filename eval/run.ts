/**
 * Eval runner: `pnpm eval --subset smoke` (default) or `--subset full`.
 * `--fake` uses the fake provider (no network, no cost) to check the runner itself.
 * Writes eval/reports/<stamp>-<subset>.{md,json,calls.jsonl}.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createDefaultGateway } from "../src/ai/factory";
import { createGateway } from "../src/ai/gateway";
import { createFakeProvider } from "../src/ai/providers/fake";
import { createJsonlSink } from "../src/ai/sinks";
import { loadFixtures } from "./lib";
import { renderMarkdown, runEval } from "./runner";

const { values } = parseArgs({
  options: { subset: { type: "string", default: "smoke" }, fake: { type: "boolean", default: false } },
});
const subset = values.subset ?? "smoke";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: the key may come from the environment (CI).
}

const root = path.join(process.cwd(), "eval");
const fixtures = loadFixtures(path.join(root, "fixtures"), subset);
if (fixtures.length === 0) throw new Error(`No fixtures in subset "${subset}"`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const base = path.join(root, "reports", `${stamp}-${subset}`);
mkdirSync(path.dirname(base), { recursive: true });
const sink = createJsonlSink(`${base}.calls.jsonl`);

const gateway = values.fake
  ? createGateway({
      provider: createFakeProvider([
        (req) =>
          JSON.stringify({
            language: "en",
            topic: "fake topic",
            claims: [{ text: "A fake claim", excerpt: req.prompt.slice(req.prompt.indexOf('"""') + 4, req.prompt.indexOf('"""') + 40).trim() || "x" }],
          }),
      ]),
      sink,
    })
  : createDefaultGateway(sink);

console.log(`Running ${fixtures.length} fixtures (subset "${subset}", ${values.fake ? "fake" : "live"} provider)...`);
const report = await runEval({ fixtures, gateway, subset });
writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
writeFileSync(`${base}.md`, renderMarkdown(report));
console.log(renderMarkdown(report));
console.log(`Report: ${path.relative(process.cwd(), base)}.md`);
process.exitCode = report.totals.failed > 0 ? 1 : 0;
