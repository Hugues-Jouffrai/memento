import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { Gateway } from "../src/ai/gateway";
import { JudgeOutput } from "../src/ai/schemas";
import type { CallRecord } from "../src/ai/types";
import { enrichNote, proposeCards } from "../src/server/stages";
import { normalize } from "./lib";

/**
 * Eval of the enrichment track (R-PIPE-05, R-CARD-03): a sparse personal note goes through `enrich` then `cards`.
 * Mechanical checks (key facts covered, cards rejected by the validator) plus an LLM judge on specificity,
 * relevance, question quality and accuracy. The judge is the same family of model as the generator, so it is a
 * relative signal for comparing prompts and models, not an absolute quality measure.
 */

const Expect = z.object({
  language: z.string(),
  must_cover: z.array(z.object({ id: z.string(), any: z.array(z.string()).min(1) })).default([]),
});

export interface EnrichFixture {
  id: string;
  note: string;
  expect: z.infer<typeof Expect>;
}

export function loadEnrichFixtures(dir: string): EnrichFixture[] {
  return readdirSync(dir)
    .filter((n) => statSync(path.join(dir, n)).isDirectory())
    .sort()
    .map((id) => ({
      id,
      note: readFileSync(path.join(dir, id, "input.md"), "utf8").trim(),
      expect: Expect.parse(parse(readFileSync(path.join(dir, id, "expect.yaml"), "utf8"))),
    }));
}

export interface EnrichResult {
  id: string;
  status: "ok" | "failed";
  error?: string;
  claims: { text: string; origin: string }[];
  cards: { question: string; answer: string }[];
  rejected: { question: string; reason: string }[];
  coverage: number;
  missing: string[];
  judge?: { specificity: number; relevance: number; question_quality: number; accuracy: number; issues: string[] };
  costUsd: number;
  latencyMs: number;
}

export interface Models {
  enrich?: string;
  cards?: string;
  judge?: string;
  enrichPrompt?: string;
  cardsPrompt?: string;
  refine?: boolean;
}

const sum = (calls: CallRecord[]) => ({
  costUsd: calls.reduce((n, c) => n + (c.costUsd ?? 0), 0),
  latencyMs: calls.reduce((n, c) => n + c.latencyMs, 0),
});

export async function runEnrichEval(opts: { fixtures: EnrichFixture[]; ai: Gateway; models?: Models; sink: { calls: CallRecord[] } }): Promise<EnrichResult[]> {
  const results: EnrichResult[] = [];
  for (const f of opts.fixtures) {
    const before = opts.sink.calls.length;
    try {
      const extracted = await enrichNote({ ai: opts.ai } as never, null, f.note, { model: opts.models?.enrich, promptVersion: opts.models?.enrichPrompt, refine: opts.models?.refine });
      const { accepted, rejected } = await proposeCards(opts.ai, null, extracted.claims.map((c) => c.text), { model: opts.models?.cards, promptVersion: opts.models?.cardsPrompt });
      const haystack = normalize([extracted.topic, ...extracted.claims.map((c) => c.text), ...accepted.map((c) => `${c.question} ${c.answer}`)].join(" \n "));
      const missing = f.expect.must_cover.filter((m) => !m.any.some((t) => haystack.includes(normalize(t)))).map((m) => m.id);
      const { data: judge } = await opts.ai.run({
        stage: "judge",
        userId: null,
        vars: {
          note: f.note,
          claims: extracted.claims.map((c, i) => `${i + 1}. [${c.origin}] ${c.text}`).join("\n"),
          cards: accepted.map((c, i) => `${i + 1}. Q: ${c.question}\n   A: ${c.answer}`).join("\n"),
        },
        schema: JudgeOutput,
        model: opts.models?.judge,
      });
      results.push({
        id: f.id,
        status: "ok",
        claims: extracted.claims.map((c) => ({ text: c.text, origin: c.origin })),
        cards: accepted.map((c) => ({ question: c.question, answer: c.answer })),
        rejected: rejected.map((r) => ({ question: r.card.question, reason: r.reason })),
        coverage: f.expect.must_cover.length ? (f.expect.must_cover.length - missing.length) / f.expect.must_cover.length : 1,
        missing,
        judge,
        ...sum(opts.sink.calls.slice(before)),
      });
    } catch (err) {
      results.push({ id: f.id, status: "failed", error: String(err).slice(0, 300), claims: [], cards: [], rejected: [], coverage: 0, missing: [], ...sum(opts.sink.calls.slice(before)) });
    }
  }
  return results;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const f1 = (x: number) => x.toFixed(1);

export function renderEnrichMarkdown(label: string, results: EnrichResult[]): string {
  const ok = results.filter((r) => r.status === "ok" && r.judge);
  const j = (k: keyof NonNullable<EnrichResult["judge"]> & ("specificity" | "relevance" | "question_quality" | "accuracy")) => mean(ok.map((r) => r.judge![k] as number));
  const lines = [
    `# Enrichment eval: ${label}`,
    "",
    `Fixtures ${results.length}, failed ${results.length - ok.length}. Mean key-fact coverage ${pct(mean(ok.map((r) => r.coverage)))}. Judge (1-5): specificity ${f1(j("specificity"))}, relevance ${f1(j("relevance"))}, question quality ${f1(j("question_quality"))}, accuracy ${f1(j("accuracy"))}. Cards rejected by the validator: ${ok.reduce((n, r) => n + r.rejected.length, 0)}. Cost $${results.reduce((n, r) => n + r.costUsd, 0).toFixed(4)}.`,
    "",
    "| Fixture | Claims | Cards | Coverage (missing) | Spec | Rel | Q | Acc |",
    "|---|---|---|---|---|---|---|---|",
    ...results.map((r) =>
      r.status === "ok" && r.judge
        ? `| ${r.id} | ${r.claims.length} | ${r.cards.length} | ${pct(r.coverage)} (${r.missing.join(", ") || "-"}) | ${r.judge.specificity} | ${r.judge.relevance} | ${r.judge.question_quality} | ${r.judge.accuracy} |`
        : `| ${r.id} | FAILED: ${r.error} | | | | | | |`,
    ),
    "",
  ];
  for (const r of ok) {
    lines.push(`## ${r.id}`, "", "Claims:", ...r.claims.map((c, i) => `${i + 1}. [${c.origin}] ${c.text}`), "", "Cards:", ...r.cards.map((c) => `- Q: ${c.question}\n  A: ${c.answer}`));
    if (r.rejected.length) lines.push("", "Rejected: " + r.rejected.map((x) => `(${x.reason}) ${x.question}`).join(" ; "));
    lines.push("", "Judge issues: " + (r.judge!.issues.join(" | ") || "-"), "");
  }
  return lines.join("\n");
}
