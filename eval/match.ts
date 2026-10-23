import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { Gateway } from "../src/ai/gateway";
import type { CallRecord } from "../src/ai/types";
import { MERGE_CONFIDENCE, embeddingText, mergeSummary, shortlist } from "../src/domain/matching";
import { MAX_SOURCE_CHARS, enrichNote, extractClaims } from "../src/server/stages";
import { decideMatch, type NewSource } from "../src/server/topics";

/**
 * Eval of topic matching (R-KB-02): sources arrive one after the other; each is embedded, the closest pages are
 * shortlisted and the model decides "same page" or "new page". The final grouping is compared with the expected
 * clusters, pair by pair: a wrongly merged pair is the costly error, a missed merge only makes a duplicate page.
 */

const Sequence = z.object({
  sources: z.array(z.object({ id: z.string(), file: z.string(), kind: z.enum(["rich", "note"]) })).min(2),
  clusters: z.array(z.array(z.string()).min(2)).default([]),
});

export interface MatchSource {
  id: string;
  text: string;
  kind: "rich" | "note";
}

export interface MatchSequence {
  sources: MatchSource[];
  clusters: string[][];
}

export function loadSequence(file: string): MatchSequence {
  const dir = path.dirname(file);
  const seq = Sequence.parse(parse(readFileSync(file, "utf8")));
  const ids = new Set(seq.sources.map((s) => s.id));
  for (const c of seq.clusters) for (const id of c) if (!ids.has(id)) throw new Error(`cluster names unknown source "${id}"`);
  return {
    sources: seq.sources.map((s) => ({ id: s.id, kind: s.kind, text: readFileSync(path.join(dir, s.file), "utf8").trim() })),
    clusters: seq.clusters,
  };
}

/** Which sources are expected together: pairs inside a cluster (`same`); every other pair is expected apart. */
export function expectedPairs(sourceIds: readonly string[], clusters: readonly string[][]): { same: Set<string>; total: number } {
  const key = (a: string, b: string) => [a, b].sort().join("|");
  const same = new Set<string>();
  for (const c of clusters) for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) same.add(key(c[i]!, c[j]!));
  return { same, total: (sourceIds.length * (sourceIds.length - 1)) / 2 };
}

export interface MatchScore {
  /** Pairs that were merged although they should be apart (the costly error). */
  falseMerges: string[];
  /** Pairs that should have been merged but ended on different pages (only a duplicate page). */
  missedMerges: string[];
  pairs: number;
}

/** `pageOf` maps each source id to the page it ended on. */
export function scoreGrouping(pageOf: Record<string, string>, sourceIds: readonly string[], clusters: readonly string[][]): MatchScore {
  const { same, total } = expectedPairs(sourceIds, clusters);
  const falseMerges: string[] = [];
  const missedMerges: string[] = [];
  for (let i = 0; i < sourceIds.length; i++) {
    for (let j = i + 1; j < sourceIds.length; j++) {
      const a = sourceIds[i]!;
      const b = sourceIds[j]!;
      const together = pageOf[a] === pageOf[b];
      const shouldBe = same.has([a, b].sort().join("|"));
      if (together && !shouldBe) falseMerges.push(`${a} + ${b}`);
      if (!together && shouldBe) missedMerges.push(`${a} + ${b}`);
    }
  }
  return { falseMerges, missedMerges, pairs: total };
}

export interface MatchStep {
  source: string;
  topic: string;
  candidates: { title: string; similarity: number }[];
  decision: "update" | "new";
  confidence: number;
  page: string;
  reasoning: string;
}

export interface MatchRun {
  steps: MatchStep[];
  score: MatchScore;
  pages: { id: string; title: string; sources: string[] }[];
  costUsd: number;
}

export interface MatchModels {
  match?: string;
  matchPrompt?: string;
  threshold?: number;
  /** Cache of extraction results (claims or enrichment), so matching can be iterated without paying for extraction again. */
  cacheFile?: string;
}

type Cache = Record<string, NewSource>;

async function extractSource(ai: Gateway, s: MatchSource, cache: Cache): Promise<NewSource> {
  const hit = cache[s.id];
  if (hit) return hit;
  const text = s.text.slice(0, MAX_SOURCE_CHARS);
  const out = s.kind === "note" ? await enrichNote({ ai } as never, null, text) : await extractClaims({ ai } as never, "eval", text, "");
  const source = { topic: out.topic, summary: out.summary, claims: out.claims.map((c) => ({ text: c.text })) };
  cache[s.id] = source;
  return source;
}

export async function runMatchEval(opts: { sequence: MatchSequence; ai: Gateway; sink: { calls: CallRecord[] }; models?: MatchModels }): Promise<MatchRun> {
  const { sequence, ai, models = {} } = opts;
  const cache: Cache = models.cacheFile && existsSync(models.cacheFile) ? (JSON.parse(readFileSync(models.cacheFile, "utf8")) as Cache) : {};
  const pages: { id: string; title: string; summary: string[]; embedding: number[]; sources: string[] }[] = [];
  const pageOf: Record<string, string> = {};
  const steps: MatchStep[] = [];

  for (const s of sequence.sources) {
    const source = await extractSource(ai, s, cache);
    if (models.cacheFile) {
      mkdirSync(path.dirname(models.cacheFile), { recursive: true });
      writeFileSync(models.cacheFile, JSON.stringify(cache, null, 1));
    }
    const [vector] = (await ai.embed({ stage: "embed", userId: null, texts: [embeddingText(source.topic, source.summary)] })).vectors;
    const candidates = shortlist(vector!, pages);
    const match = await decideMatch(ai, null, source, candidates, { model: models.match, promptVersion: models.matchPrompt, threshold: models.threshold });
    let target = pages.find((p) => p.id === match.page?.id);
    if (target) {
      target.summary = mergeSummary(target.summary, source.summary);
      target.embedding = (await ai.embed({ stage: "embed", userId: null, texts: [embeddingText(target.title, target.summary)] })).vectors[0]!;
      target.sources.push(s.id);
    } else {
      target = { id: `page-${pages.length + 1}`, title: source.topic, summary: source.summary, embedding: vector!, sources: [s.id] };
      pages.push(target);
    }
    pageOf[s.id] = target.id;
    steps.push({
      source: s.id,
      topic: source.topic,
      candidates: candidates.map((c) => ({ title: c.title, similarity: Number(c.similarity.toFixed(3)) })),
      decision: match.decision,
      confidence: match.confidence,
      page: target.id,
      reasoning: match.reasoning,
    });
  }
  return {
    steps,
    score: scoreGrouping(pageOf, sequence.sources.map((s) => s.id), sequence.clusters),
    pages: pages.map((p) => ({ id: p.id, title: p.title, sources: p.sources })),
    costUsd: opts.sink.calls.reduce((n, c) => n + (c.costUsd ?? 0), 0),
  };
}

export function renderMatchMarkdown(label: string, run: MatchRun, threshold = MERGE_CONFIDENCE): string {
  const lines = [
    `# Topic matching eval: ${label}`,
    "",
    `Pairs ${run.score.pairs}: false merges ${run.score.falseMerges.length}, missed merges ${run.score.missedMerges.length}. Pages ${run.pages.length}. Confidence threshold ${threshold}. Cost $${run.costUsd.toFixed(4)}.`,
    `False merges: ${run.score.falseMerges.join("; ") || "none"}`,
    `Missed merges: ${run.score.missedMerges.join("; ") || "none"}`,
    "",
    "## Pages",
    ...run.pages.map((p) => `- ${p.id} "${p.title}": ${p.sources.join(", ")}`),
    "",
    "## Steps",
    "",
    "| Source | Topic | Closest pages (cosine) | Decision | Conf | Page |",
    "|---|---|---|---|---|---|",
    ...run.steps.map((s) => `| ${s.source} | ${s.topic} | ${s.candidates.map((c) => `${c.title} ${c.similarity}`).join("; ") || "-"} | ${s.decision} | ${s.confidence} | ${s.page} |`),
    "",
    "## Reasoning",
    ...run.steps.filter((s) => s.candidates.length).map((s) => `- ${s.source}: ${s.reasoning}`),
    "",
  ];
  return lines.join("\n");
}
