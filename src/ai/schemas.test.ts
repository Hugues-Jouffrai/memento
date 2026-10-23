import { describe, expect, it } from "vitest";
import { createGateway } from "./gateway";
import { createFakeProvider } from "./providers/fake";
import { createMemorySink } from "./sinks";
import { CardsOutput, ClaimsOutput, Clean, EnrichOutput, GARBLED } from "./schemas";

describe("[R-PIPE-07] garbled model output never reaches the database", () => {
  it("rejects control characters and the replacement character, accepts accents and typographic marks", () => {
    expect(GARBLED.test("citoyenneté, été, œuvre, « guillemets », ’ apostrophe, — tiret, 日本語")).toBe(false);
    expect(GARBLED.test("citoyennet\u0092 romaine")).toBe(true); // seen from a model: U+0092 instead of "é"
    expect(GARBLED.test("caract�re")).toBe(true);
    expect(Clean.safeParse("Une phrase correcte.").success).toBe(true);
    expect(Clean.safeParse("citoyennet\u0092").success).toBe(false);
    expect(Clean.safeParse("").success).toBe(false);
  });

  it("applies to cards, claims and enrichment output", () => {
    const bad = "t\u0092";
    expect(CardsOutput.safeParse({ cards: [{ claim: 1, question: `Pourquoi ${bad} ?`, answer: "x", rank: 1 }] }).success).toBe(false);
    expect(CardsOutput.safeParse({ cards: [{ claim: 1, question: "Pourquoi ?", answer: `x${bad}`, rank: 1 }] }).success).toBe(false);
    expect(ClaimsOutput.safeParse({ language: "fr", topic: "t", summary: ["s"], claims: [{ text: bad, excerpt: "e" }] }).success).toBe(false);
    expect(EnrichOutput.safeParse({ language: "fr", topic: bad, summary: ["s"], claims: [{ text: "ok", origin: "model" }] }).success).toBe(false);
    expect(EnrichOutput.safeParse({ language: "fr", topic: "Sujet", summary: ["s"], claims: [{ text: "ok", origin: "model" }] }).success).toBe(true);
  });

  it("the gateway retries a garbled answer with feedback and returns the clean one", async () => {
    const garbled = JSON.stringify({ cards: [{ claim: 1, question: "Pourquoi citoyennet\u0092 ?", answer: "Parce que.", rank: 1 }] });
    const clean = JSON.stringify({ cards: [{ claim: 1, question: "Pourquoi la citoyenneté a-t-elle été étendue ?", answer: "Parce que.", rank: 1 }] });
    const provider = createFakeProvider([garbled, clean]);
    const sink = createMemorySink();
    const gateway = createGateway({ provider, sink, loadPromptFn: () => ({ stage: "cards", version: "v9", template: "{{claims}}" }) });
    const { data } = await gateway.run({ stage: "cards", userId: null, vars: { claims: "1. x" }, schema: CardsOutput });
    expect(data.cards[0]!.question).toContain("citoyenneté");
    expect(sink.calls.map((c) => c.status)).toEqual(["invalid_output", "ok"]);
    expect(provider.requests[1]!.prompt).toContain("corrupted characters");
  });
});

describe("[R-CARD-08] schema limits leave room for 30 requested cards", () => {
  const card = (i: number) => ({ claim: 1, question: `Question ${i} ?`, answer: "x", rank: i + 1 });
  const cards = (n: number) => ({ cards: Array.from({ length: n }, (_, i) => card(i)) });
  it("cards: up to 40 accepted, 41 refused", () => {
    expect(CardsOutput.safeParse(cards(40)).success).toBe(true);
    expect(CardsOutput.safeParse(cards(41)).success).toBe(false);
  });
  it("quoted claims: up to 30 accepted, 31 refused", () => {
    const out = (n: number) => ({ language: "fr", topic: "t", summary: ["s"], claims: Array.from({ length: n }, (_, i) => ({ text: `Fait ${i}.`, excerpt: `extrait ${i}` })) });
    expect(ClaimsOutput.safeParse(out(30)).success).toBe(true);
    expect(ClaimsOutput.safeParse(out(31)).success).toBe(false);
  });
  it("enrichment claims: up to 30 accepted, 31 refused", () => {
    const out = (n: number) => ({ language: "fr", topic: "t", summary: ["s"], claims: Array.from({ length: n }, (_, i) => ({ text: `Fait ${i}.`, origin: "model" })) });
    expect(EnrichOutput.safeParse(out(30)).success).toBe(true);
    expect(EnrichOutput.safeParse(out(31)).success).toBe(false);
  });
});
