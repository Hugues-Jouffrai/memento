import path from "node:path";
import { describe, expect, it } from "vitest";
import { createGateway } from "../src/ai/gateway";
import { createFakeProvider } from "../src/ai/providers/fake";
import { createMemorySink } from "../src/ai/sinks";
import { loadLinkCases, runLinkEval, scoreLinks } from "./link";

describe("link eval", () => {
  const cases = loadLinkCases(path.join(process.cwd(), "eval", "link-fixtures", "cases.yaml"));

  it("[R-KB-12] has linked pairs and many same-field traps", () => {
    expect(cases.filter((c) => c.link.length > 0).length).toBeGreaterThanOrEqual(6);
    expect(cases.filter((c) => c.link.length === 0).length).toBeGreaterThanOrEqual(8);
  });

  it("[R-KB-12] a link that is neither expected nor acceptable is false; a missed link is only missed", () => {
    expect(scoreLinks("t", { link: [], ok: [] }, ["X"]).falseLinks).toEqual(["t: X"]);
    expect(scoreLinks("t", { link: ["A"], ok: ["B"] }, ["B"])).toMatchObject({ falseLinks: [], missed: ["t: A"], found: [] });
    expect(scoreLinks("t", { link: ["A"], ok: [] }, ["A"])).toMatchObject({ falseLinks: [], missed: [], found: ["t: A"] });
  });

  it("[R-KB-12] runs every case through the stage and counts false links", async () => {
    const reply = JSON.stringify({ reasoning: "r", links: [{ candidate: 1, reason: "Un lien précis entre les deux sujets.", confidence: 0.95 }] });
    const sink = createMemorySink();
    const ai = createGateway({ provider: createFakeProvider(cases.map(() => reply)), sink });
    const run = await runLinkEval({ cases, ai, sink });
    expect(run.cases).toHaveLength(cases.length);
    // Linking candidate 1 of every case is right only where candidate 1 is the expected one.
    const wrong = cases.filter((c) => !c.link.includes(c.candidates[0]!.title) && !c.ok.includes(c.candidates[0]!.title)).length;
    expect(run.falseLinks).toHaveLength(wrong);
  });
});
