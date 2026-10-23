import { describe, expect, it } from "vitest";
import { createDbSink } from "./db-sink";
import type { CallRecord } from "./types";

const call: CallRecord = {
  at: "2026-10-14T10:00:00.000Z", userId: "u1", stage: "extract", provider: "fake", model: "m", promptVersion: "extract/v1",
  attempt: 1, status: "ok", inputTokens: 10, outputTokens: 5, costUsd: 0.0001, latencyMs: 12, error: null,
};

describe("[R-PIPE-07] ai_call database sink", () => {
  it("writes one row per call with snake_case columns", async () => {
    const rows: Record<string, unknown>[] = [];
    await createDbSink({ insert: async (r) => (rows.push(r), { error: null }) }).record(call);
    expect(rows).toEqual([expect.objectContaining({ user_id: "u1", prompt_version: "extract/v1", cost_usd: 0.0001, latency_ms: 12 })]);
  });
  it("keeps a null cost as null (unknown price)", async () => {
    const rows: Record<string, unknown>[] = [];
    await createDbSink({ insert: async (r) => (rows.push(r), { error: null }) }).record({ ...call, costUsd: null });
    expect(rows[0]?.cost_usd).toBeNull();
  });
  it("reports a failed write instead of swallowing it", async () => {
    const seen: string[] = [];
    await createDbSink({ insert: async () => ({ error: { message: "down" } }) }, (m) => seen.push(m)).record(call);
    expect(seen).toEqual(["ai_call insert failed: down"]);
  });
});
