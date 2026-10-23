import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { ExtractOutput } from "../src/ai/schemas";

export const MAX_INPUT_CHARS = 30_000;

const Expect = z.object({
  subsets: z.array(z.string()).default([]),
  language: z.enum(["fr", "en"]),
  kind: z.string(),
  cluster: z.string().optional(),
  note: z.string().optional(),
  must_cover: z.array(z.object({ id: z.string(), any: z.array(z.string()).min(1) })).default([]),
  forbidden: z.array(z.string()).default([]),
});
export type Expect = z.infer<typeof Expect>;

export interface Fixture {
  id: string;
  text: string;
  truncated: boolean;
  expect: Expect;
}

export function loadFixtures(dir: string, subset: string): Fixture[] {
  return readdirSync(dir)
    .filter((name) => statSync(path.join(dir, name)).isDirectory())
    .sort()
    .flatMap((id) => {
      const expect = Expect.parse(parse(readFileSync(path.join(dir, id, "expect.yaml"), "utf8")));
      if (subset !== "full" && !expect.subsets.includes(subset)) return [];
      const full = readFileSync(path.join(dir, id, "input.md"), "utf8");
      return [{ id, text: full.slice(0, MAX_INPUT_CHARS), truncated: full.length > MAX_INPUT_CHARS, expect }];
    });
}

/** Lowercase, drop markdown emphasis/quote variants and collapse whitespace so excerpts compare fairly. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[*_`]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export interface Score {
  languageCorrect: boolean;
  /** Share of claims whose excerpt occurs verbatim in the source. A mechanical check, not an LLM judge. */
  excerptFaithfulness: number;
  claimCount: number;
  /** Share of `must_cover` items found in the claims or topic. */
  coverage: number;
  missing: string[];
  forbiddenHits: string[];
}

export function scoreExtraction(out: ExtractOutput, source: string, expect: Expect): Score {
  const src = normalize(source);
  const grounded = out.claims.filter((c) => src.includes(normalize(c.excerpt))).length;
  const claimsText = normalize([out.topic, ...out.claims.map((c) => c.text)].join(" \n "));
  const missing = expect.must_cover.filter((m) => !m.any.some((t) => claimsText.includes(normalize(t)))).map((m) => m.id);
  return {
    languageCorrect: out.language === expect.language,
    excerptFaithfulness: out.claims.length ? grounded / out.claims.length : 0,
    claimCount: out.claims.length,
    coverage: expect.must_cover.length ? (expect.must_cover.length - missing.length) / expect.must_cover.length : 1,
    missing,
    forbiddenHits: expect.forbidden.filter((t) => claimsText.includes(normalize(t))),
  };
}

/** Expectations must be grounded: at least one accepted term of each item appears in the fixture itself. */
export function ungroundedExpectations(f: Fixture): string[] {
  const src = normalize(f.text);
  return f.expect.must_cover.filter((m) => !m.any.some((t) => src.includes(normalize(t)))).map((m) => m.id);
}
