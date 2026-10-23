import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AiOutputError, createGateway } from "./gateway";
import { createFakeProvider } from "./providers/fake";
import { createMemorySink } from "./sinks";
import { computeCostUsd } from "./cost";
import { EMBEDDING_DIMENSIONS, PRICES } from "./config";
import { loadPrompt, renderPrompt } from "./prompts";

const schema = z.object({ language: z.enum(["fr", "en"]), topic: z.string().min(1) });
const good = JSON.stringify({ language: "fr", topic: "mémoire" });
const NOW = () => new Date("2026-10-14T12:00:00Z");

function setup(replies: Parameters<typeof createFakeProvider>[0], maxAttempts = 3) {
  const provider = createFakeProvider(replies);
  const sink = createMemorySink();
  const sleeps: number[] = [];
  const gateway = createGateway({ provider, sink, now: NOW, maxAttempts, sleep: async (ms) => void sleeps.push(ms) });
  return { provider, sink, gateway, sleeps };
}
const run = (g: ReturnType<typeof setup>["gateway"]) =>
  g.run({ stage: "smoke", userId: "u1", vars: { text: "Bonjour" }, schema });

describe("AI gateway", () => {
  it("[R-PIPE-07] logs model, prompt version, tokens, cost, latency and user for each call", async () => {
    const { gateway, sink } = setup([good]);
    const { data } = await run(gateway);
    expect(data).toEqual({ language: "fr", topic: "mémoire" });
    expect(sink.calls).toHaveLength(1);
    const call = sink.calls[0]!;
    expect(call).toMatchObject({
      userId: "u1",
      stage: "smoke",
      model: "gemini-3.5-flash-lite",
      promptVersion: "v1",
      status: "ok",
      attempt: 1,
    });
    expect(call.inputTokens).toBeGreaterThan(0);
    expect(call.outputTokens).toBeGreaterThan(0);
    expect(call.costUsd).toBeGreaterThan(0);
    expect(call.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("[R-PIPE-07] retries invalid output with the error fed back, and logs every attempt", async () => {
    const { gateway, sink, provider } = setup(["not json", JSON.stringify({ language: "de", topic: "x" }), good]);
    const { data } = await run(gateway);
    expect(data.language).toBe("fr");
    expect(sink.calls.map((c) => c.status)).toEqual(["invalid_output", "invalid_output", "ok"]);
    expect(provider.requests[1]!.prompt).toContain("Your previous answer was rejected");
  });

  it("[R-PIPE-07] invalid output never reaches the caller: it throws after the last attempt", async () => {
    const { gateway, sink } = setup(["nope"], 2);
    await expect(run(gateway)).rejects.toBeInstanceOf(AiOutputError);
    expect(sink.calls).toHaveLength(2);
  });

  it("[R-PIPE-07] accepts JSON wrapped in a markdown fence", async () => {
    const { gateway } = setup(["```json\n" + good + "\n```"]);
    expect((await run(gateway)).data.topic).toBe("mémoire");
  });

  it("[R-PIPE-07] logs and rethrows a provider error that retrying cannot fix", async () => {
    const { gateway, sink, sleeps } = setup([new Error("400 invalid argument")]);
    await expect(run(gateway)).rejects.toThrow("400");
    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0]).toMatchObject({ status: "provider_error" });
    expect(sleeps).toEqual([]);
  });

  it("[R-PIPE-01] retries an overloaded provider (503) with a pause, logging every attempt, and recovers", async () => {
    const { gateway, sink, sleeps } = setup([new Error('503 {"status":"UNAVAILABLE"}'), good]);
    expect((await run(gateway)).data.topic).toBe("mémoire");
    expect(sink.calls.map((c) => c.status)).toEqual(["provider_error", "ok"]);
    expect(sleeps).toEqual([2000]);
  });

  it("[R-PIPE-01] gives up after two retries of a provider that stays overloaded", async () => {
    const { gateway, sink, sleeps } = setup([new Error("503 high demand")]);
    await expect(run(gateway)).rejects.toThrow("503");
    expect(sink.calls).toHaveLength(3);
    expect(sleeps).toEqual([2000, 6000]);
  });

  it("a provider retry does not use up the attempts reserved for invalid output", async () => {
    const { gateway, sink } = setup([new Error("429 rate limited"), "not json", good], 2);
    expect((await run(gateway)).data.topic).toBe("mémoire");
    expect(sink.calls.map((c) => c.status)).toEqual(["provider_error", "invalid_output", "ok"]);
  });
});

describe("prompts", () => {
  it("[R-AI-02] loads the latest versioned prompt file and exposes its version", () => {
    expect(loadPrompt("smoke")).toMatchObject({ stage: "smoke", version: "v1" });
  });
  it("[R-AI-02] a missing variable is an error, not an empty string", () => {
    expect(() => renderPrompt("hi {{name}}", {})).toThrow("name");
    expect(renderPrompt("hi {{name}}", { name: "x" })).toBe("hi x");
  });
});

describe("cost", () => {
  it("[R-PIPE-07] computes cost from the configured price (per 1M tokens)", () => {
    const cost = computeCostUsd("gemini-3.5-flash-lite", { inputTokens: 1_000_000, outputTokens: 1_000_000 }, NOW());
    expect(cost).toBeCloseTo(0.3 + 2.5);
  });
  it("[R-PIPE-07] applies the scheduled price change of gemini-3.8-flash on 2027-01-01", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0 };
    expect(computeCostUsd("gemini-3.8-flash", usage, new Date("2026-12-31T23:00:00Z"), PRICES)).toBeCloseTo(0.75);
    expect(computeCostUsd("gemini-3.8-flash", usage, new Date("2027-01-01T00:00:00Z"), PRICES)).toBeCloseTo(1.5);
  });
  it("[R-PIPE-07] prices embeddings at $0.20 per 1M input tokens", () => {
    expect(computeCostUsd("gemini-embedding-2", { inputTokens: 1_000_000, outputTokens: 0 }, NOW())).toBeCloseTo(0.2);
  });
  it("[R-PIPE-07] returns null, not zero, for an unpriced model", () => {
    expect(computeCostUsd("some-unpriced-model", { inputTokens: 10, outputTokens: 0 }, NOW())).toBeNull();
  });
});

describe("AI gateway: embeddings", () => {
  it("[R-PIPE-07] [R-KB-02] returns one vector per text at the configured dimension and logs the call with its cost", async () => {
    const { gateway, sink } = setup([good]);
    const out = await gateway.embed({ stage: "embed", userId: "u1", texts: ["les abeilles dansent", "Cicéron et la citoyenneté"] });
    expect(out.vectors).toHaveLength(2);
    expect(out.vectors.every((v) => v.length === EMBEDDING_DIMENSIONS)).toBe(true);
    expect(out).toMatchObject({ model: "gemini-embedding-2", dimensions: EMBEDDING_DIMENSIONS });
    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0]).toMatchObject({ stage: "embed", userId: "u1", model: "gemini-embedding-2", status: "ok", outputTokens: 0 });
    expect(sink.calls[0]!.inputTokens).toBeGreaterThan(0);
    expect(sink.calls[0]!.costUsd).toBeGreaterThan(0);
  });

  it("[R-KB-02] similar texts are closer than unrelated ones (the fake embedding is a word-overlap proxy, used by tests only)", async () => {
    const { gateway } = setup([good]);
    const { vectors: [a, b, c] } = await gateway.embed({ stage: "embed", userId: null, texts: ["danse des abeilles et nectar", "les abeilles dansent pour le nectar", "citoyenneté romaine de Cicéron"] });
    const dot = (x: number[], y: number[]) => x.reduce((n, v, i) => n + v * y[i]!, 0);
    expect(dot(a!, b!)).toBeGreaterThan(dot(a!, c!));
  });

  it("[R-PIPE-01] retries an overloaded provider and logs every attempt", async () => {
    const { provider, sink, gateway, sleeps } = setup([good]);
    let n = 0;
    const embed = provider.embed;
    provider.embed = async (req) => {
      if (n++ === 0) throw new Error("503 UNAVAILABLE: high demand");
      return embed(req);
    };
    await gateway.embed({ stage: "embed", userId: null, texts: ["abeilles"] });
    expect(sink.calls.map((c) => c.status)).toEqual(["provider_error", "ok"]);
    expect(sleeps).toEqual([2000]);
  });

  it("[R-PIPE-07] rejects a response with the wrong number of vectors or the wrong dimension, never returning it", async () => {
    const { provider, sink, gateway } = setup([good]);
    provider.embed = async () => ({ vectors: [[0.1, 0.2]], usage: { inputTokens: 3 } });
    await expect(gateway.embed({ stage: "embed", userId: null, texts: ["a"] })).rejects.toThrow("embed: expected");
    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0]!.status).toBe("invalid_output");
  });
});
