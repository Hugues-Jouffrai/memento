/**
 * `pnpm tsx scripts/measure-embedding.ts`
 * Dev tool (live Gemini, a few cents): measures `gemini-embedding-2` through the gateway on the eval sources:
 * returned dimension, billed tokens and cost, latency, and how well each output dimension separates the three FSRS
 * sources (one subject) from unrelated sources. Used to choose EMBEDDING_DIMENSIONS and the matching threshold (D40).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createDefaultGateway } from "../src/ai/factory";
import { createMemorySink } from "../src/ai/sinks";

try {
  process.loadEnvFile(".env.local");
} catch {
  // The key may come from the environment.
}

const root = path.join(process.cwd(), "eval");
const read = (p: string) => readFileSync(path.join(root, p), "utf8").trim().slice(0, 6000);
const cluster = ["en-cluster-fsrs-anki", "en-cluster-fsrs-osr", "en-cluster-fsrs-remnote"].map((id) => ({ id, text: read(`fixtures/${id}/input.md`) }));
const others = ["en-article-bitter-lesson", "en-fast-moving-pricing", "en-wiki-cognitive-load", "en-notes-louis-podcast", "en-video-fireship-gemini"].map((id) => ({ id, text: read(`fixtures/${id}/input.md`) }));
const notes = ["fr-cicero-citoyennete", "fr-incas", "fr-teotihuacan", "fr-warhol", "fr-leclerc"].map((id) => ({ id, text: read(`enrich-fixtures/${id}/input.md`) }));
const all = [...cluster, ...others, ...notes];

const sink = createMemorySink();
const ai = createDefaultGateway(sink);
const dot = (a: number[], b: number[]) => a.reduce((n, v, i) => n + v * b[i]!, 0);
const norm = (a: number[]) => Math.sqrt(dot(a, a));

for (const dimensions of [768, 1536, 3072]) {
  const before = sink.calls.length;
  const started = Date.now();
  const { vectors } = await ai.embed({ stage: "embed", userId: null, texts: all.map((x) => x.text), dimensions });
  const ms = Date.now() - started;
  const calls = sink.calls.slice(before);
  const v = new Map(all.map((x, i) => [x.id, vectors[i]!]));
  const within: number[] = [];
  for (let i = 0; i < cluster.length; i++) for (let j = i + 1; j < cluster.length; j++) within.push(dot(v.get(cluster[i]!.id)!, v.get(cluster[j]!.id)!));
  const cross: number[] = [];
  for (const c of cluster) for (const o of [...others, ...notes]) cross.push(dot(v.get(c.id)!, v.get(o.id)!));
  const sample = vectors[0]!;
  console.log(
    `dim ${dimensions}: got ${sample.length}, norm ${norm(sample).toFixed(3)}, ${calls.length} call(s), ${calls.reduce((n, c) => n + c.inputTokens, 0)} tokens, $${calls.reduce((n, c) => n + (c.costUsd ?? 0), 0).toFixed(6)}, ${ms} ms`,
  );
  console.log(`  FSRS sources among themselves: ${within.map((x) => x.toFixed(3)).join(", ")} (min ${Math.min(...within).toFixed(3)})`);
  console.log(`  FSRS vs unrelated: max ${Math.max(...cross).toFixed(3)}, mean ${(cross.reduce((a, b) => a + b, 0) / cross.length).toFixed(3)}; margin (min within - max cross) ${(Math.min(...within) - Math.max(...cross)).toFixed(3)}`);
}
