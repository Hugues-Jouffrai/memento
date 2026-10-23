import path from "node:path";
import { describe, expect, it } from "vitest";
import { createGateway } from "../src/ai/gateway";
import { createFakeProvider } from "../src/ai/providers/fake";
import { createMemorySink } from "../src/ai/sinks";
import { findRevisions } from "../src/server/revisions";
import { loadReviseCases, scoreCase } from "./revise";

describe("revise eval", () => {
  const cases = loadReviseCases(path.join(process.cwd(), "eval", "revise-fixtures", "cases.yaml"));

  it("[R-KB-06] has conflicting-date, revised-fact and trap cases", () => {
    expect(cases.filter((c) => c.expect.some((e) => e.kind === "contradiction")).length).toBeGreaterThanOrEqual(3);
    expect(cases.filter((c) => c.expect.some((e) => e.kind === "revise")).length).toBeGreaterThanOrEqual(1);
    expect(cases.filter((c) => c.expect.length === 0).length).toBeGreaterThanOrEqual(8);
  });

  it("[R-KB-06] a finding on a trap is a false finding; a missed conflict is only missed", () => {
    expect(scoreCase("t", [], [{ kind: "contradiction", existing: 0, incoming: 0 }]).falseFindings).toHaveLength(1);
    expect(scoreCase("c", [{ kind: "contradiction", existing: 1, new: 1 }], [])).toMatchObject({ falseFindings: [], missed: ["c: contradiction 1/1"] });
  });

  it("[R-KB-06] a revise where only a contradiction is right is false; the reverse is safe", () => {
    const f = (kind: "revise" | "contradiction") => [{ kind, existing: 0, incoming: 0 }];
    expect(scoreCase("a", [{ kind: "contradiction", existing: 1, new: 1 }], f("revise")).falseFindings).toHaveLength(1);
    expect(scoreCase("b", [{ kind: "revise", existing: 1, new: 1 }], f("contradiction")).falseFindings).toHaveLength(0);
  });
});

describe("findRevisions", () => {
  const run = (reply: unknown) => {
    const ai = createGateway({ provider: createFakeProvider([JSON.stringify(reply)]), sink: createMemorySink() });
    return findRevisions(ai, null, { title: "T", existing: ["a", "b"], incoming: ["c"] });
  };

  it("[R-KB-06] converts claim numbers to indexes and keeps valid findings", async () => {
    const r = await run({ reasoning: "r", findings: [{ kind: "contradiction", existing: 2, new: 1, text: null, reason: "x" }] });
    expect(r.findings).toEqual([{ kind: "contradiction", existing: 1, incoming: 0, text: null, reason: "x" }]);
  });

  it("[R-KB-06] refuses unknown claim numbers, a revision without text, and repeated pairs", async () => {
    const r = await run({
      reasoning: "r",
      findings: [
        { kind: "contradiction", existing: 3, new: 1, text: null, reason: "x" },
        { kind: "revise", existing: 1, new: 1, text: " ", reason: "x" },
        { kind: "contradiction", existing: 1, new: 1, text: null, reason: "x" },
        { kind: "revise", existing: 1, new: 1, text: "y", reason: "x" },
      ],
    });
    expect(r.findings).toHaveLength(1);
    expect(r.rejected.map((x) => x.why)).toEqual(["unknown claim number", "revision without corrected text", "repeated pair"]);
  });

  it("[R-KB-06] makes no model call when there is nothing to compare", async () => {
    const provider = createFakeProvider(["{}"]);
    const ai = createGateway({ provider, sink: createMemorySink() });
    await findRevisions(ai, null, { title: "T", existing: [], incoming: ["c"] });
    expect(provider.requests).toHaveLength(0);
  });
});
