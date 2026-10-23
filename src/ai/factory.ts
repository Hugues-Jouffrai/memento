import { createGateway, type Gateway } from "./gateway";
import { createGeminiProvider } from "./providers/gemini";
import type { CallSink } from "./types";

/** Production wiring: Gemini behind the gateway. Fails closed when the key is missing. */
export function createDefaultGateway(
  sink: CallSink,
  env: Record<string, string | undefined> = process.env,
  extra: { transientDelaysMs?: readonly number[] } = {},
): Gateway {
  return createGateway({ provider: createGeminiProvider(env.GEMINI_API_KEY ?? ""), sink, ...extra });
}
