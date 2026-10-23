import path from "node:path";
import { describe, expect, it } from "vitest";
import { createGateway } from "../src/ai/gateway";
import { createFakeProvider } from "../src/ai/providers/fake";
import { createMemorySink } from "../src/ai/sinks";
import { loadFixtures, normalize, scoreExtraction, ungroundedExpectations, type Expect } from "./lib";
import { renderMarkdown, runEval } from "./runner";

const FIXTURES = path.join(process.cwd(), "eval", "fixtures");
const exp: Expect = {
  subsets: [],
  language: "en",
  kind: "article",
  must_cover: [
    { id: "a", any: ["alpha"] },
    { id: "b", any: ["beta", "bêta"] },
  ],
  forbidden: ["gamma"],
};

describe("eval fixtures", () => {
  it("[R-EVAL-01] the smoke subset has at least 8 fixtures, FR and EN, each with expectations", () => {
    const smoke = loadFixtures(FIXTURES, "smoke");
    expect(smoke.length).toBeGreaterThanOrEqual(8);
    expect(new Set(smoke.map((f) => f.expect.language))).toEqual(new Set(["fr", "en"]));
    expect(smoke.every((f) => f.expect.must_cover.length > 0)).toBe(true);
  });

  it("[R-EVAL-01] every must-cover item can be found in its own fixture (no ungrounded expectations)", () => {
    const bad = loadFixtures(FIXTURES, "full").flatMap((f) => ungroundedExpectations(f).map((id) => `${f.id}:${id}`));
    expect(bad).toEqual([]);
  });

  it("[R-EVAL-01] the cluster fixtures on one subject share a cluster tag", () => {
    const fsrs = loadFixtures(FIXTURES, "full").filter((f) => f.expect.cluster === "fsrs");
    expect(fsrs.length).toBeGreaterThanOrEqual(3);
  });
});

describe("eval metrics", () => {
  const source = "Alpha is **first**.\nBeta   is second.";
  it("[R-EVAL-02] scores faithfulness, coverage, language and forbidden terms", () => {
    const s = scoreExtraction(
      {
        language: "en",
        topic: "letters",
        claims: [
          { text: "Alpha comes first", excerpt: "Alpha is first." },
          { text: "Gamma is third", excerpt: "Gamma is third." },
        ],
      },
      source,
      exp,
    );
    expect(s.excerptFaithfulness).toBe(0.5);
    expect(s.coverage).toBe(0.5);
    expect(s.missing).toEqual(["b"]);
    expect(s.forbiddenHits).toEqual(["gamma"]);
    expect(s.languageCorrect).toBe(true);
  });
  it("[R-EVAL-02] normalisation ignores case, markdown emphasis and whitespace", () => {
    expect(normalize("A  **B**\n c")).toBe("a b c");
  });
});

describe("eval runner", () => {
  it("[R-EVAL-01] runs a subset from the fixtures and produces a report with cost", async () => {
    const fixtures = loadFixtures(FIXTURES, "smoke").slice(0, 2);
    const reply = JSON.stringify({ language: "en", topic: "t", claims: [{ text: "c", excerpt: "not in source" }] });
    const gateway = createGateway({ provider: createFakeProvider([reply]), sink: createMemorySink() });
    const report = await runEval({ fixtures, gateway, subset: "smoke" });
    expect(report.results).toHaveLength(2);
    expect(report.totals.failed).toBe(0);
    expect(report.totals.costUsd).toBeGreaterThan(0);
    expect(renderMarkdown(report)).toContain("# Eval report: smoke");
  });

  it("[R-EVAL-01] a fixture whose output stays invalid is reported as failed, not dropped", async () => {
    const fixtures = loadFixtures(FIXTURES, "smoke").slice(0, 1);
    const gateway = createGateway({ provider: createFakeProvider(["nope"]), sink: createMemorySink(), maxAttempts: 2 });
    const report = await runEval({ fixtures, gateway, subset: "smoke" });
    expect(report.totals.failed).toBe(1);
    expect(report.results[0]?.status).toBe("failed");
  });
});
