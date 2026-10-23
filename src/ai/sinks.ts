import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { CallRecord, CallSink } from "./types";

export function createMemorySink(): CallSink & { calls: CallRecord[] } {
  const calls: CallRecord[] = [];
  return { calls, record: (c) => void calls.push(c) };
}

/** One JSON line per call. Used by the eval runner. The database sink (`ai_call`) arrives in M1. */
export function createJsonlSink(file: string): CallSink {
  mkdirSync(path.dirname(file), { recursive: true });
  return { record: (c) => appendFileSync(file, JSON.stringify(c) + "\n") };
}
