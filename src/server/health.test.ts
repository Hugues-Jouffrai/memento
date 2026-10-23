import { describe, expect, it } from "vitest";
import { checkHealth } from "./health";

describe("health", () => {
  it("[M0] is ok and skips the database when none is configured", async () => {
    expect(await checkHealth({})).toEqual({ ok: true, db: "skipped" });
  });
  it("[M0] queries the database and reports ok", async () => {
    const f = (async () => new Response("[]", { status: 200 })) as typeof fetch;
    expect(await checkHealth({ SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "k" }, f)).toEqual({ ok: true, db: "ok" });
  });
  it("[M0] reports an error when the database fails or is unreachable", async () => {
    const env = { SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "k" };
    const bad = (async () => new Response("", { status: 500 })) as typeof fetch;
    const down = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    expect(await checkHealth(env, bad)).toEqual({ ok: false, db: "error" });
    expect(await checkHealth(env, down)).toEqual({ ok: false, db: "error" });
  });
});
