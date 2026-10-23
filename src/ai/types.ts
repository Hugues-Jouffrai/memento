export interface GenerateRequest {
  model: string;
  prompt: string;
  /** JSON Schema of the expected output. Providers use it for structured output. */
  jsonSchema?: Record<string, unknown>;
  /** Files the model should read (PDF, images). Sent inline with the prompt. */
  files?: { mimeType: string; data: Buffer }[];
}

export interface Usage {
  inputTokens: number;
  /** Includes thinking tokens, which are billed as output. */
  outputTokens: number;
}

export interface GenerateResponse {
  text: string;
  usage: Usage;
}

export interface EmbedRequest {
  model: string;
  /** One vector per text, in order. */
  texts: string[];
  /** Output dimension (the model's vectors are truncated to it and re-normalised). */
  dimensions: number;
}

export interface EmbedResponse {
  vectors: number[][];
  usage: { inputTokens: number };
}

export interface AiProvider {
  readonly name: string;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  embed(req: EmbedRequest): Promise<EmbedResponse>;
}

export type CallStatus = "ok" | "invalid_output" | "provider_error";

/** One row of the `ai_call` log (R-PIPE-07). */
export interface CallRecord {
  at: string;
  userId: string | null;
  stage: string;
  provider: string;
  model: string;
  promptVersion: string;
  attempt: number;
  status: CallStatus;
  inputTokens: number;
  outputTokens: number;
  /** USD. `null` when no price is known for the model. */
  costUsd: number | null;
  latencyMs: number;
  error: string | null;
}

export interface CallSink {
  record(call: CallRecord): void | Promise<void>;
}
