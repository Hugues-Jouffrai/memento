import type { Gateway } from "../src/ai/gateway";
import { ExtractOutput } from "../src/ai/schemas";
import type { CallRecord } from "../src/ai/types";
import { scoreExtraction, type Fixture, type Score } from "./lib";

export interface FixtureResult {
  id: string;
  truncated: boolean;
  status: "ok" | "failed";
  error?: string;
  score?: Score;
  attempts: number;
  costUsd: number | null;
  latencyMs: number;
  model: string;
}

export interface Report {
  subset: string;
  at: string;
  results: FixtureResult[];
  totals: {
    fixtures: number;
    failed: number;
    meanFaithfulness: number;
    meanCoverage: number;
    languageCorrect: number;
    forbiddenHits: number;
    costUsd: number;
    unpricedCalls: number;
    meanLatencyMs: number;
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export async function runEval(opts: {
  fixtures: Fixture[];
  gateway: Gateway;
  subset: string;
  now?: () => Date;
}): Promise<Report> {
  const results: FixtureResult[] = [];
  for (const f of opts.fixtures) {
    try {
      const { data, calls } = await opts.gateway.run({
        stage: "extract",
        userId: null,
        vars: { text: f.text },
        schema: ExtractOutput,
      });
      results.push({ id: f.id, truncated: f.truncated, status: "ok", score: scoreExtraction(data, f.text, f.expect), ...summarize(calls) });
    } catch (err) {
      results.push({ id: f.id, truncated: f.truncated, status: "failed", error: String(err).slice(0, 300), attempts: 0, costUsd: null, latencyMs: 0, model: "" });
    }
  }
  const ok = results.filter((r): r is FixtureResult & { score: Score } => r.status === "ok" && r.score !== undefined);
  return {
    subset: opts.subset,
    at: (opts.now ?? (() => new Date()))().toISOString(),
    results,
    totals: {
      fixtures: results.length,
      failed: results.length - ok.length,
      meanFaithfulness: mean(ok.map((r) => r.score.excerptFaithfulness)),
      meanCoverage: mean(ok.map((r) => r.score.coverage)),
      languageCorrect: ok.filter((r) => r.score.languageCorrect).length,
      forbiddenHits: ok.reduce((n, r) => n + r.score.forbiddenHits.length, 0),
      costUsd: results.reduce((n, r) => n + (r.costUsd ?? 0), 0),
      unpricedCalls: results.filter((r) => r.costUsd === null && r.status === "ok").length,
      meanLatencyMs: mean(results.map((r) => r.latencyMs)),
    },
  };
}

function summarize(calls: CallRecord[]) {
  const priced = calls.every((c) => c.costUsd !== null);
  return {
    attempts: calls.length,
    costUsd: priced ? calls.reduce((n, c) => n + (c.costUsd ?? 0), 0) : null,
    latencyMs: calls.reduce((n, c) => n + c.latencyMs, 0),
    model: calls[0]?.model ?? "",
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function renderMarkdown(r: Report): string {
  const t = r.totals;
  const rows = r.results.map((x) =>
    x.status === "ok" && x.score
      ? `| ${x.id}${x.truncated ? " (truncated)" : ""} | ${x.score.languageCorrect ? "yes" : "NO"} | ${x.score.claimCount} | ${pct(x.score.excerptFaithfulness)} | ${pct(x.score.coverage)}${x.score.missing.length ? ` (missing: ${x.score.missing.join(", ")})` : ""} | ${x.score.forbiddenHits.join(", ") || "-"} | ${x.attempts} | ${x.costUsd === null ? "n/a" : "$" + x.costUsd.toFixed(5)} | ${Math.round(x.latencyMs)} ms |`
      : `| ${x.id} | FAILED | | | | | | | ${x.error ?? ""} |`,
  );
  return [
    `# Eval report: ${r.subset} (${r.at})`,
    "",
    `Fixtures: ${t.fixtures}, failed: ${t.failed}. Mean excerpt faithfulness ${pct(t.meanFaithfulness)}, mean coverage ${pct(t.meanCoverage)}, language correct ${t.languageCorrect}/${t.fixtures - t.failed}, forbidden hits ${t.forbiddenHits}.`,
    `Cost $${t.costUsd.toFixed(5)}${t.unpricedCalls ? ` (${t.unpricedCalls} unpriced)` : ""}, mean latency ${Math.round(t.meanLatencyMs)} ms.`,
    "",
    "Faithfulness here is mechanical (the excerpt occurs verbatim in the source). The LLM-judged faithfulness of R-EVAL-02 is not built yet.",
    "",
    "| Fixture | Lang ok | Claims | Faithful | Coverage | Forbidden | Attempts | Cost | Latency |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}
