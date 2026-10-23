import { execSync } from "node:child_process";

/** Env for the app under test, read from the running local Supabase stack (never production). */
export function localSupabaseEnv(): Record<string, string | undefined> {
  const out = execSync("supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const vars = Object.fromEntries(
    out.split(/\r?\n/).flatMap((l) => {
      const m = l.match(/^([A-Z_]+)="?(.*?)"?$/);
      return m ? [[m[1], m[2]]] : [];
    }),
  );
  return {
    SUPABASE_URL: vars.API_URL,
    SUPABASE_PUBLISHABLE_KEY: vars.PUBLISHABLE_KEY ?? vars.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: vars.SERVICE_ROLE_KEY,
    MAILPIT_URL: vars.MAILPIT_URL ?? "http://127.0.0.1:54324",
  };
}
