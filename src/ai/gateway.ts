import type { ZodType } from "zod";
import { z } from "zod";
import { DEFAULT_MODEL, EMBEDDING_DIMENSIONS, MAX_ATTEMPTS, MODELS, STAGE_MODEL } from "./config";
import { computeCostUsd } from "./cost";
import { loadPrompt, renderPrompt } from "./prompts";
import type { AiProvider, CallRecord, CallSink, GenerateResponse } from "./types";

export class AiOutputError extends Error {
  constructor(
    readonly stage: string,
    readonly attempts: number,
    detail: string,
  ) {
    super(`AI output for stage "${stage}" invalid after ${attempts} attempts: ${detail}`);
    this.name = "AiOutputError";
  }
}

export interface RunOptions<T> {
  stage: string;
  userId: string | null;
  vars: Record<string, string>;
  schema: ZodType<T>;
  promptVersion?: string;
  model?: string;
  /** Files for vision stages. */
  files?: { mimeType: string; data: Buffer }[];
}

export interface EmbedOptions {
  stage: string;
  userId: string | null;
  texts: string[];
  model?: string;
  dimensions?: number;
}

export interface GatewayDeps {
  provider: AiProvider;
  sink: CallSink;
  now?: () => Date;
  maxAttempts?: number;
  loadPromptFn?: typeof loadPrompt;
  /** Pause between retries of a transient provider error (tests inject a no-op). */
  sleep?: (ms: number) => Promise<void>;
  /** Delays before each retry of a transient provider error. Defaults to two short retries. */
  transientDelaysMs?: readonly number[];
}

/** Delays before retrying an overloaded or rate-limited provider (503, 429): two retries. */
export const TRANSIENT_RETRY_DELAYS_MS = [2000, 6000];

export function isTransientProviderError(err: unknown): boolean {
  return /\b(503|429|500|502|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(String(err));
}

/** Models sometimes wrap JSON in a markdown fence even when asked not to. */
function extractJson(text: string): unknown {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim());
  return JSON.parse(fenced ? fenced[1]! : text);
}

/**
 * The only way to call an AI model (R-PIPE-07). Every attempt is logged with its cost.
 * The output is validated against a zod schema; invalid output is retried with the
 * errors fed back, and never returned to the caller.
 */
export function createGateway(deps: GatewayDeps) {
  const now = deps.now ?? (() => new Date());
  const maxAttempts = deps.maxAttempts ?? MAX_ATTEMPTS;
  const load = deps.loadPromptFn ?? loadPrompt;
  const transientDelays = deps.transientDelaysMs ?? TRANSIENT_RETRY_DELAYS_MS;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function run<T>(opts: RunOptions<T>): Promise<{ data: T; calls: CallRecord[] }> {
    const prompt = load(opts.stage, opts.promptVersion);
    const model = opts.model ?? STAGE_MODEL[opts.stage] ?? DEFAULT_MODEL;
    const jsonSchema = z.toJSONSchema(opts.schema) as Record<string, unknown>;
    const base = renderPrompt(prompt.template, opts.vars);
    const calls: CallRecord[] = [];
    let feedback = "";
    let lastError = "";

    let transientRetries = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = now();
      let response: GenerateResponse | undefined;
      let record: CallRecord = {
        at: started.toISOString(),
        userId: opts.userId,
        stage: opts.stage,
        provider: deps.provider.name,
        model,
        promptVersion: prompt.version,
        attempt,
        status: "ok",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: null,
        latencyMs: 0,
        error: null,
      };

      try {
        response = await deps.provider.generate({ model, prompt: base + feedback, jsonSchema, files: opts.files });
      } catch (err) {
        record = { ...record, status: "provider_error", latencyMs: now().getTime() - started.getTime(), error: String(err) };
        calls.push(record);
        await deps.sink.record(record);
        // An overloaded provider is retried here (logged each time); anything else fails the call at once.
        if (isTransientProviderError(err) && transientRetries < transientDelays.length) {
          await sleep(transientDelays[transientRetries]!);
          transientRetries++;
          attempt--;
          continue;
        }
        throw err;
      }

      record = {
        ...record,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        costUsd: computeCostUsd(model, response.usage, started),
        latencyMs: now().getTime() - started.getTime(),
      };

      let parsed: { success: true; data: T } | { success: false; error: string };
      try {
        const result = opts.schema.safeParse(extractJson(response.text));
        parsed = result.success
          ? { success: true, data: result.data }
          : { success: false, error: z.prettifyError(result.error) };
      } catch (err) {
        parsed = { success: false, error: `not valid JSON (${String(err)})` };
      }

      if (parsed.success) {
        calls.push(record);
        await deps.sink.record(record);
        return { data: parsed.data, calls };
      }

      lastError = parsed.error;
      record = { ...record, status: "invalid_output", error: lastError };
      calls.push(record);
      await deps.sink.record(record);
      feedback = `\n\nYour previous answer was rejected:\n${lastError}\nReturn only JSON that matches the schema.`;
    }

    throw new AiOutputError(opts.stage, maxAttempts, lastError);
  }

  /** Embeds texts (one vector each). Logged like every call, with its cost; an overloaded provider is retried. */
  async function embed(opts: EmbedOptions): Promise<{ vectors: number[][]; model: string; dimensions: number; call: CallRecord }> {
    const model = opts.model ?? MODELS.embedding;
    const dimensions = opts.dimensions ?? EMBEDDING_DIMENSIONS;
    if (!opts.texts.length) throw new Error("embed: no texts");
    let transientRetries = 0;
    for (;;) {
      const started = now();
      const base: CallRecord = {
        at: started.toISOString(),
        userId: opts.userId,
        stage: opts.stage,
        provider: deps.provider.name,
        model,
        promptVersion: "-",
        attempt: 1 + transientRetries,
        status: "ok",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: null,
        latencyMs: 0,
        error: null,
      };
      try {
        const res = await deps.provider.embed({ model, texts: opts.texts, dimensions });
        const bad = res.vectors.length !== opts.texts.length || res.vectors.some((v) => v.length !== dimensions);
        const usage = { inputTokens: res.usage.inputTokens, outputTokens: 0 };
        const call: CallRecord = {
          ...base,
          status: bad ? "invalid_output" : "ok",
          inputTokens: usage.inputTokens,
          costUsd: computeCostUsd(model, usage, started),
          latencyMs: now().getTime() - started.getTime(),
          error: bad ? `expected ${opts.texts.length} vectors of ${dimensions} numbers` : null,
        };
        await deps.sink.record(call);
        if (bad) throw new Error(`embed: ${call.error}`);
        return { vectors: res.vectors, model, dimensions, call };
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("embed: expected")) throw err;
        const call: CallRecord = { ...base, status: "provider_error", latencyMs: now().getTime() - started.getTime(), error: String(err) };
        await deps.sink.record(call);
        if (isTransientProviderError(err) && transientRetries < transientDelays.length) {
          await sleep(transientDelays[transientRetries]!);
          transientRetries++;
          continue;
        }
        throw err;
      }
    }
  }

  return { run, embed };
}

export type Gateway = ReturnType<typeof createGateway>;
