/** Reads a required env var; fails loudly instead of running half-configured (R-SEC-02). */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}
