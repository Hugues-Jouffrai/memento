/** `next dev` compiles each route on first hit, which makes the first browser interactions flaky. Warm them up. */
export default async function globalSetup() {
  const base = "http://localhost:3100";
  for (const path of ["/login", "/", "/tray", "/review", "/pages", "/auth/callback", "/r/warmup", "/notify/confirm/warmup","/api/health"]) {
    await fetch(base + path, { redirect: "manual" }).catch(() => undefined);
  }
}
