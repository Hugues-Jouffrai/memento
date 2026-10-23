export type DbStatus = "ok" | "skipped" | "error";

export interface HealthResult {
  ok: boolean;
  db: DbStatus;
}

interface HealthEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

/**
 * Runs one cheap query so Supabase Free does not pause the project for inactivity (D17).
 * Skipped (still ok) when no database is configured, e.g. in CI before the project exists.
 */
export async function checkHealth(env: HealthEnv, fetchImpl: typeof fetch = fetch): Promise<HealthResult> {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: true, db: "skipped" };
  try {
    const res = await fetchImpl(`${url}/rest/v1/ai_call?select=id&limit=1`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? { ok: true, db: "ok" } : { ok: false, db: "error" };
  } catch {
    return { ok: false, db: "error" };
  }
}
