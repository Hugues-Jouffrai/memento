import type { CallRecord, CallSink } from "./types";

/** The slice of a Supabase table handle the sink needs (keeps the AI layer free of the Supabase SDK). */
export interface AiCallTable {
  insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
}

export function toAiCallRow(c: CallRecord): Record<string, unknown> {
  return {
    at: c.at,
    user_id: c.userId,
    stage: c.stage,
    provider: c.provider,
    model: c.model,
    prompt_version: c.promptVersion,
    attempt: c.attempt,
    status: c.status,
    input_tokens: c.inputTokens,
    output_tokens: c.outputTokens,
    cost_usd: c.costUsd,
    latency_ms: c.latencyMs,
    error: c.error,
  };
}

/** Writes every call to `ai_call` (D24). A failed write is reported loudly but never fails the user's capture. */
export function createDbSink(table: AiCallTable, onError: (message: string) => void = console.error): CallSink {
  return {
    record: async (c) => {
      const { error } = await table.insert(toAiCallRow(c));
      if (error) onError(`ai_call insert failed: ${error.message}`);
    },
  };
}
