/**
 * `pnpm ops [--days N]`: the owner's terminal dashboard (R-ADMIN-01..07, D63). Read-only, service role.
 * Fetches only the columns needed (no addresses, subjects or error text), aggregates in
 * src/server/ops-report.ts and prints aggregates only.
 */
import { createClient } from "@supabase/supabase-js";
import { buildOpsReport, type OpsReport } from "../src/server/ops-report";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may come from the environment.
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const db = createClient(url, key, { auth: { persistSession: false } });

const di = process.argv.indexOf("--days");
const days = di >= 0 ? Number(process.argv[di + 1]) : 30;
if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("--days must be an integer from 1 to 365");
const now = new Date();
const DAY = 86_400_000;
// The AI section needs the whole month and the last 30 days besides the window.
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const since = new Date(Math.min(now.getTime() - days * DAY, now.getTime() - 30 * DAY, monthStart.getTime())).toISOString();

type Q = { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };
async function all<T>(table: string, build: () => Q): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}
const from = (t: string, cols: string) => db.from(t).select(cols);

async function authUsers() {
  const out: { last_sign_in_at: string | null }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth: ${error.message}`);
    // Only the timestamp is kept; the address is dropped here.
    out.push(...data.users.map((u) => ({ last_sign_in_at: u.last_sign_in_at ?? null })));
    if (data.users.length < 1000) return out;
  }
}

const report = buildOpsReport({
  now,
  days,
  captures: await all("capture", () => from("capture", "user_id,status,created_at,parent_id,route,fail_reason:notes->>failReason,decision:auth->>decision,cards:notes->cards").order("created_at") as unknown as Q),
  jobs: await all("job", () => from("job", "stage,status,attempts,max_attempts,run_after,lease_until,created_at,updated_at").or(`created_at.gte.${since},status.in.(queued,running,failed)`).order("created_at") as unknown as Q),
  aiCalls: await all("ai_call", () => from("ai_call", "at,user_id,stage,model,status,cost_usd,input_tokens,output_tokens").gte("at", since).order("at") as unknown as Q),
  emails: await all("email_out", () => from("email_out", "kind,status,created_at").gte("created_at", since).order("created_at") as unknown as Q),
  reviews: await all("review_log", () => from("review_log", "user_id,reviewed_at,rating,duration_ms").order("reviewed_at") as unknown as Q),
  cards: await all("card", () => from("card", "user_id,status,created_at,kept_at").order("created_at") as unknown as Q),
  profiles: await all("profile", () => from("profile", "id:user_id,created_at,ai_cap_day_usd,ai_cap_month_usd").order("created_at") as unknown as Q),
  authUsers: await authUsers(),
  waitlist: await all("waitlist", () => from("waitlist", "locale,confirmed_at").order("confirmed_at") as unknown as Q),
  invites: await all("invite_code", () => from("invite_code", "max_uses,uses,expires_at,revoked_at").order("created_at") as unknown as Q),
});

print(report);

// ---- printing -------------------------------------------------------------------------------

function print(r: OpsReport) {
  const out: string[] = [];
  const head = (t: string) => out.push("", `== ${t} ${"=".repeat(Math.max(3, 70 - t.length))}`);
  const kv = (o: Record<string, number>) => (Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ") : "none");
  const table = (rows: (string | number)[][]) => {
    const w = (rows[0] ?? []).map((_, i) => Math.max(...rows.map((x) => String(x[i]).length)));
    for (const row of rows) out.push("  " + row.map((c, i) => (i === 0 ? String(c).padEnd(w[i] ?? 0) : String(c).padStart(w[i] ?? 0))).join("  "));
  };
  const usd = (n: number) => `$${n.toFixed(4)}`;
  const bar = (pct: number) => `[${"#".repeat(Math.min(20, Math.round(pct / 5))).padEnd(20, ".")}]`;

  out.push(`Memento owner report: last ${r.windowDays} days, ${r.generatedAt} (aggregates only)`);

  head("Health");
  out.push(`  newest finished job: ${r.health.newestDoneJobAgeMin == null ? "none" : `${r.health.newestDoneJobAgeMin} min ago`}`);
  out.push("  (app commit and /api/health are not reachable from here; DB reachable since this ran)");

  head("Captures (mails, P1)");
  out.push(`  total ${r.captures.total}; by status: ${kv(r.captures.byStatus)}`);
  out.push(`  by route: ${kv(r.captures.byRoute)}`);
  out.push(`  failure reasons: ${kv(r.captures.failReasons)}`);
  out.push(`  rejected by decision: ${kv(r.captures.rejectDecisions)}`);
  const days7 = r.captures.byDay.slice(-14).filter((d) => d.total > 0);
  if (days7.length) table([["day", "total", "detail"], ...days7.map((d) => [d.day, d.total, kv(d.byStatus)])]);

  head("Jobs (P2)");
  out.push(`  stuck queued (> ${r.jobs.stuckThresholdMin} min late): ${r.jobs.stuckQueued}; running past lease: ${r.jobs.expiredLease}; retrying: ${r.jobs.retrying}; failed: ${r.jobs.failed}`);
  out.push(`  oldest overdue queued job: ${r.jobs.oldestQueuedMin == null ? "none" : `${r.jobs.oldestQueuedMin} min`}`);
  for (const [stage, st] of Object.entries(r.jobs.byStageState)) out.push(`  ${stage.padEnd(10)} ${kv(st)}`);

  head("AI cost (P3)");
  out.push(`  month to date ${usd(r.ai.monthToDateUsd)} of $${r.ai.budgetMonthUsd} budget: ${r.ai.budgetPct}% ${bar(r.ai.budgetPct)}`);
  out.push(`  window: ${r.ai.windowCalls} calls, ${usd(r.ai.windowUsd)}; unpriced calls: ${r.ai.unpricedCalls}; status: ${kv(r.ai.statusCounts)}`);
  out.push(`  cost per finished capture: ${r.ai.costPerDoneCaptureUsd == null ? "n/a" : usd(r.ai.costPerDoneCaptureUsd)}`);
  table([["stage", "calls", "cost", "errors"], ...Object.entries(r.ai.byStage).map(([k, v]) => [k, v.calls, usd(v.costUsd), v.errors])]);
  table([["model", "calls", "errors"], ...Object.entries(r.ai.byModel).map(([k, v]) => [k, v.calls, v.errors])]);
  const aiDays = r.ai.byDay.slice(-14).filter((d) => d.calls > 0);
  if (aiDays.length) table([["day", "calls", "cost", "errors"], ...aiDays.map((d) => [d.day, d.calls, usd(d.costUsd), d.errors])]);
  const c = r.ai.caps;
  out.push(`  per-user caps (${c.users} users): day >=50% ${c.day.over50}, >=80% ${c.day.over80}, >=100% ${c.day.over100}; month >=50% ${c.month.over50}, >=80% ${c.month.over80}, >=100% ${c.month.over100}`);

  head("Mails (P4) - LOWER BOUND");
  out.push(`  ${r.mails.note}`);
  out.push(`  today ${r.mails.sentToday}/${r.mails.limits.day} (${r.mails.dayPct}%) ${bar(r.mails.dayPct)}`);
  out.push(`  month ${r.mails.sentMonth}/${r.mails.limits.month} (${r.mails.monthPct}%) ${bar(r.mails.monthPct)}; failed this month ${r.mails.failedMonth}`);
  out.push(`  sent by kind (window): ${kv(r.mails.sentByKind)}; reminders today: ${r.mails.reminders.sentToday} sent, ${r.mails.reminders.failedToday} failed`);
  const mDays = r.mails.byDay.slice(-14).filter((d) => d.sent + d.failed > 0);
  if (mDays.length) table([["day", "sent", "failed"], ...mDays.map((d) => [d.day, d.sent, d.failed])]);

  head("Users and activity (P5)");
  out.push(`  profiles ${r.activity.profiles} (${r.activity.newProfilesInWindow} new in window); last sign-in: ${kv(r.activity.lastSeenBuckets)}`);
  out.push(`  funnel: ${r.funnel.profiles} profiles -> ${r.funnel.withCapture} with a capture -> ${r.funnel.withActiveCard} with an active card -> ${r.funnel.withReview} with a review`);
  const actDays = r.activity.byDay.slice(-14).filter((d) => d.reviews + d.newProfiles > 0);
  if (actDays.length) table([["day", "reviews", "reviewers", "new"], ...actDays.map((d) => [d.day, d.reviews, d.activeReviewers, d.newProfiles])]);

  head("Waitlist (P6)");
  out.push(`  total ${r.waitlist.total} (${kv(r.waitlist.byLocale)}); new in window ${r.waitlist.newInWindow}`);

  head("Errors, last 24 h (P7)");
  out.push(`  total ${r.errors.total}${r.errors.total ? ": " + kv(r.errors.last24h) : ""}`);
  out.push("  (unhandled exceptions live in Vercel logs, not here)");

  head("Other (P8)");
  out.push(`  invites: ${r.invites.activeLinks} active link(s), ${r.invites.usesLeft} use(s) left${r.invites.nextExpiryInHours == null ? "" : `, next expiry in ${r.invites.nextExpiryInHours} h`}`);
  out.push(`  cards created in window: ${kv(r.cardPipeline.createdByStatus)}; keep rate ${r.cardPipeline.keepRatePct ?? "n/a"}%`);
  const sf = r.cardPipeline.shortfalls;
  out.push(`  fewer cards than asked: ${sf.captures} source(s), ${sf.requested} asked, ${sf.kept} made; dropped by reason: ${kv(sf.droppedByReason)}`);
  out.push(`  review ratings: ${kv(r.reviewQuality.ratings)}; average time ${r.reviewQuality.avgDurationMs ?? "n/a"} ms`);
  out.push("  database and storage size: not available without a migration (deferred)");
  console.log(out.join("\n"));
}
