import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { Gateway } from "../src/ai/gateway";
import type { CallRecord } from "../src/ai/types";
import { hasUsableTextLayer } from "../src/domain/attachments";
import { readPdfText } from "../src/server/pdf";
import { MAX_SOURCE_CHARS, enrichNote, extractClaims, proposeCards, transcribeFile } from "../src/server/stages";
import { normalize } from "./lib";

/**
 * Eval of the attachment track (R-CAP-07, R-CAP-09, R-EVAL-01): a PDF or an image goes through the same route as in
 * production (text layer read locally, scan or picture read by the vision model), then claims and cards.
 * Mechanical checks only: was the file read the expected way, did the transcription keep the key terms
 * (`must_transcribe`), do claims and cards cover the key facts (`must_cover`).
 */

const Item = z.object({ id: z.string(), any: z.array(z.string()).min(1) });
const Expect = z.object({
  language: z.string(),
  /** How the pipeline must read the file: the PDF's own text layer, or the vision model. */
  route: z.enum(["text-layer", "vision"]),
  must_transcribe: z.array(Item).default([]),
  must_cover: z.array(Item).default([]),
});

export interface FileFixture {
  id: string;
  file: string;
  mimeType: string;
  note: string;
  expect: z.infer<typeof Expect>;
}

const MIME: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

export function loadFileFixtures(dir: string): FileFixture[] {
  return readdirSync(dir)
    .filter((n) => statSync(path.join(dir, n)).isDirectory())
    .sort()
    .map((id) => {
      const names = readdirSync(path.join(dir, id));
      const input = names.find((n) => n.startsWith("input."));
      if (!input) throw new Error(`fixture ${id}: no input.* file`);
      const mimeType = MIME[path.extname(input).toLowerCase()];
      if (!mimeType) throw new Error(`fixture ${id}: unsupported file type ${input}`);
      const notePath = path.join(dir, id, "note.txt");
      return {
        id,
        file: path.join(dir, id, input),
        mimeType,
        note: existsSync(notePath) ? readFileSync(notePath, "utf8").trim() : "",
        expect: Expect.parse(parse(readFileSync(path.join(dir, id, "expect.yaml"), "utf8"))),
      };
    });
}

export interface FileText {
  text: string;
  route: "text-layer" | "vision";
}

/** The pipeline's reading rule: a PDF with a usable text layer is read locally, everything else by vision. */
export async function readFixtureText(ai: Gateway, f: FileFixture): Promise<FileText> {
  const data = readFileSync(f.file);
  if (f.mimeType === "application/pdf") {
    const layer = await readPdfText(data).catch(() => null);
    if (layer && hasUsableTextLayer(layer.text, layer.pages)) return { text: layer.text, route: "text-layer" };
  }
  const out = await transcribeFile(ai, null, { mimeType: f.mimeType, data }, f.note);
  return { text: out.text, route: "vision" };
}

/** Items of `items` none of whose terms appear in `haystack` (accent, case and punctuation insensitive). */
export function missingItems(items: readonly z.infer<typeof Item>[], haystack: string): string[] {
  const h = normalize(haystack);
  return items.filter((m) => !m.any.some((t) => h.includes(normalize(t)))).map((m) => m.id);
}

export interface FileResult {
  id: string;
  status: "ok" | "failed";
  error?: string;
  route?: FileText["route"];
  routeOk: boolean;
  textChars: number;
  transcribeMissing: string[];
  coverMissing: string[];
  claims: { text: string; origin: string }[];
  cards: { question: string; answer: string }[];
  costUsd: number;
  latencyMs: number;
}

export async function runFileEval(opts: { fixtures: FileFixture[]; ai: Gateway; sink: { calls: CallRecord[] } }): Promise<FileResult[]> {
  const results: FileResult[] = [];
  for (const f of opts.fixtures) {
    const before = opts.sink.calls.length;
    const total = () => {
      const calls = opts.sink.calls.slice(before);
      return { costUsd: calls.reduce((n, c) => n + (c.costUsd ?? 0), 0), latencyMs: calls.reduce((n, c) => n + c.latencyMs, 0) };
    };
    try {
      const read = await readFixtureText(opts.ai, f);
      const body = read.text.slice(0, MAX_SOURCE_CHARS);
      // Same branch as the pipeline: a short picture is a sparse note, enriched; a document is quoted.
      const sparse = f.mimeType !== "application/pdf" && body.length < 1500;
      const extracted = sparse ? await enrichNote({ ai: opts.ai } as never, null, body) : await extractClaims({ ai: opts.ai } as never, "eval", body, f.note);
      const { accepted } = await proposeCards(opts.ai, null, extracted.claims.map((c) => c.text));
      const covered = [extracted.topic, ...extracted.claims.map((c) => c.text), ...accepted.map((c) => `${c.question} ${c.answer}`)].join(" \n ");
      results.push({
        id: f.id,
        status: "ok",
        route: read.route,
        routeOk: read.route === f.expect.route,
        textChars: read.text.length,
        transcribeMissing: missingItems(f.expect.must_transcribe, read.text),
        coverMissing: missingItems(f.expect.must_cover, covered),
        claims: extracted.claims.map((c) => ({ text: c.text, origin: c.origin })),
        cards: accepted.map((c) => ({ question: c.question, answer: c.answer })),
        ...total(),
      });
    } catch (err) {
      results.push({ id: f.id, status: "failed", error: String(err).slice(0, 300), routeOk: false, textChars: 0, transcribeMissing: [], coverMissing: [], claims: [], cards: [], ...total() });
    }
  }
  return results;
}

export function renderFileMarkdown(label: string, results: FileResult[], fixtures: FileFixture[]): string {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const frac = (missing: string[], total: number) => `${total - missing.length}/${total}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`;
  const lines = [
    `# File eval: ${label}`,
    "",
    `Fixtures ${results.length}, failed ${results.filter((r) => r.status === "failed").length}, wrong route ${results.filter((r) => r.status === "ok" && !r.routeOk).length}. Cost $${results.reduce((n, r) => n + r.costUsd, 0).toFixed(4)}.`,
    "",
    "| Fixture | Route | Chars | Transcribed key terms | Covered key facts | Claims | Cards |",
    "|---|---|---|---|---|---|---|",
    ...results.map((r) => {
      const e = byId.get(r.id)!.expect;
      return r.status === "ok"
        ? `| ${r.id} | ${r.route}${r.routeOk ? "" : " (expected " + e.route + ")"} | ${r.textChars} | ${frac(r.transcribeMissing, e.must_transcribe.length)} | ${frac(r.coverMissing, e.must_cover.length)} | ${r.claims.length} | ${r.cards.length} |`
        : `| ${r.id} | FAILED: ${r.error} | | | | | |`;
    }),
    "",
  ];
  for (const r of results.filter((x) => x.status === "ok")) {
    lines.push(`## ${r.id}`, "", "Claims:", ...r.claims.map((c, i) => `${i + 1}. [${c.origin}] ${c.text}`), "", "Cards:", ...r.cards.map((c) => `- Q: ${c.question}\n  A: ${c.answer}`), "");
  }
  return lines.join("\n");
}
