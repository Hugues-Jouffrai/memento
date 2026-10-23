// Read-only check of a custom domain for the web app, to run before and after the switch (docs/domain-switch.md).
// Usage: pnpm tsx scripts/check-domain.ts mailtomemento.com [old-host]
import { promises as dns } from "node:dns";

const host = process.argv[2]?.trim().toLowerCase();
const oldHost = process.argv[3]?.trim().toLowerCase() ?? "leitnerbox-v2.vercel.app";
if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
  console.error("Usage: check-domain.ts <domain> [old-host]");
  process.exit(1);
}

let failed = 0;
const line = (ok: boolean, label: string, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
};
const safe = async <T>(f: () => Promise<T>): Promise<T | null> => f().catch(() => null);
const get = (url: string, redirect: RequestRedirect = "manual") => fetch(url, { redirect, signal: AbortSignal.timeout(15_000) }).catch(() => null);

const a = await safe(() => dns.resolve4(host));
const cname = await safe(() => dns.resolveCname(host));
line(!!(a?.length || cname?.length), `${host} resolves`, (a ?? cname ?? []).join(", "));

const isVercelApp = host.endsWith(".vercel.app");
if (!isVercelApp) {
  const mx = await safe(() => dns.resolveMx(host));
  line(!!mx?.length, "mail: MX records are still there", mx?.map((m) => m.exchange).join(", "));
  const txt = (await safe(() => dns.resolveTxt(`send.${host}`)))?.map((t) => t.join("")) ?? [];
  line(txt.some((t) => t.startsWith("v=spf1")), `mail: the SPF record on send.${host} is still there`);
  const dmarc = (await safe(() => dns.resolveTxt(`_dmarc.${host}`)))?.map((t) => t.join("")) ?? [];
  line(dmarc.some((t) => t.startsWith("v=DMARC1")), "mail: the DMARC record is still there");
}

const health = await get(`https://${host}/api/health`);
const body = health ? await health.json().catch(() => null) : null;
line(health?.status === 200 && body?.ok === true, "/api/health answers ok over HTTPS", body ? `commit ${body.commit}` : "no answer");

const login = await get(`https://${host}/login`);
const html = login ? await login.text() : "";
line(login?.status === 200 && /data-style="/.test(html), "/login renders");
line((await get(`https://${host}/privacy`))?.status === 200, "/privacy is public");
const home = await get(`https://${host}/`);
const homeHtml = home ? await home.text() : "";
line(home?.status === 200 && homeHtml.includes('data-testid="landing"'), "signed out, / shows the landing page");
line((await get(`https://${host}/join/AAAAAAAAAAAAAAAAAAAAAAAAAAA`))?.status === 200, "/join/<code> answers");
const worker = await fetch(`https://${host}/api/worker`, { method: "POST", signal: AbortSignal.timeout(15_000) }).catch(() => null);
line(worker?.status === 401, "/api/worker refuses a call without the secret");

if (!isVercelApp) {
  const www = await get(`https://www.${host}/`);
  console.log(`info www.${host}: ${www ? `${www.status} ${www.headers.get("location") ?? ""}` : "no answer (fine if you did not add it)"}`);
  line((await get(`https://${oldHost}/api/health`))?.status === 200, `the old address ${oldHost} still answers`);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
