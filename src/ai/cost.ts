import { PRICES, type PriceEntry } from "./config";
import type { Usage } from "./types";

function priceAt(model: string, at: Date, table: Record<string, PriceEntry[]>): PriceEntry | null {
  const day = at.toISOString().slice(0, 10);
  const applicable = (table[model] ?? []).filter((p) => p.from <= day);
  return applicable.sort((a, b) => a.from.localeCompare(b.from)).at(-1) ?? null;
}

/** Cost in USD, or `null` when the model has no known price. */
export function computeCostUsd(
  model: string,
  usage: Usage,
  at: Date,
  table: Record<string, PriceEntry[]> = PRICES,
): number | null {
  const price = priceAt(model, at, table);
  if (!price) return null;
  return (usage.inputTokens * price.inputPerM + usage.outputTokens * price.outputPerM) / 1_000_000;
}
