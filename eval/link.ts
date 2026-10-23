import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import type { Gateway } from "../src/ai/gateway";
import type { CallRecord } from "../src/ai/types";
import { findLinks } from "../src/server/links";

/**
 * Eval of the link stage (R-KB-12): a new page and its shortlisted candidates, with the links expected. Traps are
 * candidates from the same field with no specific connection. A false link (one that is neither expected nor
 * acceptable) is the costly error: it shows on two pages. A missed link only leaves two pages unconnected.
 */

const Candidate = z.strictObject({ title: z.string(), summary: z.array(z.string()).min(1) });
const Cases = z.object({
  cases: z
    .array(z.strictObject({ id: z.string(), new: z.strictObject({ title: z.string(), summary: z.array(z.string()).min(1) }), candidates: z.array(Candidate).min(1), link: z.array(z.string()), ok: z.array(z.string()) }))
    .min(2),
});
export type LinkCase = z.infer<typeof Cases>["cases"][number];

export function loadLinkCases(file: string): LinkCase[] {
  const { cases } = Cases.parse(parse(readFileSync(file, "utf8")));
  for (const c of cases) {
    const titles = new Set(c.candidates.map((x) => x.title));
    for (const t of [...c.link, ...c.ok]) if (!titles.has(t)) throw new Error(`case ${c.id}: "${t}" is not a candidate`);
  }
  return cases;
}

export interface LinkScore {
  expected: number;
  found: string[];
  falseLinks: string[];
  missed: string[];
}

/** `linked` are the titles the stage linked. */
export function scoreLinks(id: string, c: Pick<LinkCase, "link" | "ok">, linked: readonly string[]): LinkScore {
  const allowed = new Set([...c.link, ...c.ok]);
  return {
    expected: c.link.length,
    found: linked.filter((t) => c.link.includes(t)).map((t) => `${id}: ${t}`),
    falseLinks: linked.filter((t) => !allowed.has(t)).map((t) => `${id}: ${t}`),
    missed: c.link.filter((t) => !linked.includes(t)).map((t) => `${id}: ${t}`),
  };
}

export interface LinkRun {
  cases: { id: string; score: LinkScore; reasoning: string }[];
  expected: number;
  found: number;
  falseLinks: string[];
  costUsd: number;
  calls: number;
}

export async function runLinkEval(opts: { cases: LinkCase[]; ai: Gateway; sink: { calls: CallRecord[] }; model?: string; promptVersion?: string }): Promise<LinkRun> {
  const out: LinkRun["cases"] = [];
  for (const c of opts.cases) {
    const candidates = c.candidates.map((x, i) => ({ id: `c${i + 1}`, title: x.title, summary: x.summary, similarity: 0.7 }));
    const r = await findLinks(opts.ai, null, { topic: c.new.title, summary: c.new.summary }, candidates, { model: opts.model, promptVersion: opts.promptVersion });
    out.push({ id: c.id, score: scoreLinks(c.id, c, r.accepted.map((l) => l.page.title)), reasoning: r.reasoning });
  }
  const calls = opts.sink.calls.length;
  const costUsd = opts.sink.calls.reduce((n, c) => n + (c.costUsd ?? 0), 0);
  return {
    cases: out,
    expected: out.reduce((n, c) => n + c.score.expected, 0),
    found: out.reduce((n, c) => n + c.score.found.length, 0),
    falseLinks: out.flatMap((c) => c.score.falseLinks),
    costUsd,
    calls,
  };
}

export function renderLinkMarkdown(label: string, run: LinkRun): string {
  return [
    `# Link eval: ${label}`,
    "",
    `Cases ${run.cases.length}. Links found ${run.found}/${run.expected}. False links ${run.falseLinks.length}. Cost $${run.costUsd.toFixed(4)} over ${run.calls} calls (about $${(run.calls ? run.costUsd / run.calls : 0).toFixed(5)} a call).`,
    `False links: ${run.falseLinks.join("; ") || "none"}`,
    `Missed: ${run.cases.flatMap((c) => c.score.missed).join("; ") || "none"}`,
    "",
    "## Cases",
    ...run.cases.map((c) => `- ${c.id}: found ${c.score.found.length}/${c.score.expected}, false ${c.score.falseLinks.length}. ${c.reasoning}`),
    "",
  ].join("\n");
}
