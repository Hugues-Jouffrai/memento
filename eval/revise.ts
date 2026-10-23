import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import type { Gateway } from "../src/ai/gateway";
import type { CallRecord } from "../src/ai/types";
import { findRevisions, type Finding } from "../src/server/revisions";

/**
 * Eval of the revise stage (R-KB-06): a page's facts and a new source's facts, with the findings expected. Cases with no
 * expected finding are traps (rounding, translation, more detail). A false finding is the costly error: it would
 * propose changing a fact that is right. A missed finding only leaves a conflict unflagged.
 */

const Expected = z.strictObject({ kind: z.enum(["revise", "contradiction"]), existing: z.number().int().min(1), new: z.number().int().min(1) });
const Cases = z.object({
  cases: z.array(
      z.strictObject({
        id: z.string(),
        title: z.string(),
        existing: z.array(z.string()).min(1),
        incoming: z.array(z.string()).min(1),
        expect: z.array(Expected),
        /** The page's open questions (prompt revise/v2) and the 1-based numbers of those the incoming facts answer. */
        questions: z.array(z.string()).default([]),
        resolves: z.array(z.number().int().min(1)).default([]),
      }),
    )
    .min(2),
});
export type ReviseCase = z.infer<typeof Cases>["cases"][number];

export function loadReviseCases(file: string): ReviseCase[] {
  const { cases } = Cases.parse(parse(readFileSync(file, "utf8")));
  for (const c of cases) {
    for (const e of c.expect) if (e.existing > c.existing.length || e.new > c.incoming.length) throw new Error(`case ${c.id}: expectation points at a missing claim`);
    for (const n of c.resolves) if (n > c.questions.length) throw new Error(`case ${c.id}: resolves points at a missing question`);
  }
  return cases;
}

export interface ReviseScore {
  expected: number;
  found: string[];
  /** Findings with no expected counterpart, or a "revise" where only a contradiction is right (it would overwrite a fact). */
  falseFindings: string[];
  missed: string[];
}

/** Compares the findings of one case with its expectation. A "contradiction" for an expected "revise" is safe (both facts kept): counted as found. */
export function scoreCase(id: string, expect: ReviseCase["expect"], findings: readonly Pick<Finding, "kind" | "existing" | "incoming">[]): ReviseScore {
  const label = (k: string, e: number, n: number) => `${id}: ${k} ${e}/${n}`;
  const found: string[] = [];
  const falseFindings: string[] = [];
  const hit = new Set<number>();
  for (const f of findings) {
    const i = expect.findIndex((x) => x.existing === f.existing + 1 && x.new === f.incoming + 1);
    const text = label(f.kind, f.existing + 1, f.incoming + 1);
    if (i < 0 || (f.kind === "revise" && expect[i]!.kind === "contradiction")) falseFindings.push(text);
    else {
      hit.add(i);
      found.push(text);
    }
  }
  const missed = expect.flatMap((x, i) => (hit.has(i) ? [] : [label(x.kind, x.existing, x.new)]));
  return { expected: expect.length, found, falseFindings, missed };
}

export interface ReviseRun {
  cases: { id: string; score: ReviseScore; reasoning: string; rejected: number }[];
  expected: number;
  found: number;
  falseFindings: string[];
  /** Questions reported as answered although the case says they are not (hides a question: the costly error here). */
  falseResolves: string[];
  missedResolves: string[];
  costUsd: number;
}

export async function runReviseEval(opts: { cases: ReviseCase[]; ai: Gateway; sink: { calls: CallRecord[] }; model?: string; promptVersion?: string }): Promise<ReviseRun> {
  const out: ReviseRun["cases"] = [];
  const falseResolves: string[] = [];
  const missedResolves: string[] = [];
  for (const c of opts.cases) {
    const r = await findRevisions(opts.ai, null, { title: c.title, existing: c.existing, incoming: c.incoming, questions: c.questions }, { model: opts.model, promptVersion: opts.promptVersion });
    const got = r.resolutions.map((x) => x.question + 1);
    falseResolves.push(...got.filter((n) => !c.resolves.includes(n)).map((n) => `${c.id}: question ${n}`));
    missedResolves.push(...c.resolves.filter((n) => !got.includes(n)).map((n) => `${c.id}: question ${n}`));
    out.push({ id: c.id, score: scoreCase(c.id, c.expect, r.findings), reasoning: r.reasoning, rejected: r.rejected.length });
  }
  return {
    cases: out,
    expected: out.reduce((n, c) => n + c.score.expected, 0),
    found: out.reduce((n, c) => n + c.score.found.length, 0),
    falseFindings: out.flatMap((c) => c.score.falseFindings),
    falseResolves,
    missedResolves,
    costUsd: opts.sink.calls.reduce((n, c) => n + (c.costUsd ?? 0), 0),
  };
}

export function renderReviseMarkdown(label: string, run: ReviseRun): string {
  return [
    `# Revise eval: ${label}`,
    "",
    `Cases ${run.cases.length}. Real disagreements found ${run.found}/${run.expected}. False findings ${run.falseFindings.length}. Cost $${run.costUsd.toFixed(4)}.`,
    `False findings: ${run.falseFindings.join("; ") || "none"}`,
    `False resolves: ${run.falseResolves.join("; ") || "none"}. Missed resolves: ${run.missedResolves.join("; ") || "none"}`,
    `Missed: ${run.cases.flatMap((c) => c.score.missed).join("; ") || "none"}`,
    "",
    "## Cases",
    ...run.cases.map((c) => `- ${c.id}: found ${c.score.found.length}/${c.score.expected}, false ${c.score.falseFindings.length}${c.rejected ? `, refused by checks ${c.rejected}` : ""}. ${c.reasoning}`),
    "",
  ].join("\n");
}
