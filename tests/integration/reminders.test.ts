import { describe, expect, it } from "vitest";
import { createGateway } from "@/ai/gateway";
import { createFakeProvider } from "@/ai/providers/fake";
import type { Mailer, OutboundMail, PipelineDeps } from "@/server/ports";
import { verifyReviewToken, verifyUnsubscribeToken } from "@/server/review-token";
import { runWorker } from "@/server/worker";
import { localAdmin, makeUser } from "./support";

const db = localAdmin();
const SECRET = "integration-review-secret";

function setup(secret: string | null = SECRET) {
  const sent: OutboundMail[] = [];
  const mailer: Mailer = { send: async (m) => (sent.push(m), { id: `out-${sent.length}` }) };
  const deps: PipelineDeps = {
    db,
    ai: createGateway({ provider: createFakeProvider(["{}"]), sink: { record: () => undefined } }),
    source: { fetchReceived: async () => { throw new Error("unused"); }, fetchAttachment: async () => { throw new Error("unused"); } },
    files: { save: async () => undefined },
    mailer,
    pages: { fetchPage: async () => { throw new Error("unused"); } },
    appUrl: "https://app.test",
    reviewLinkSecret: secret ?? undefined,
    now: () => new Date(),
  };
  return { deps, sent };
}

/** An active card due now for the user (what keeping a proposal creates). */
async function activeCardDue(userId: string, n = 1) {
  const { data: cap } = await db.from("capture").insert({ user_id: userId, provider_message_id: `r-${Math.random()}`, from_address: "x@y.z", status: "done", raw: {} }).select("id").single();
  const { data: src } = await db.from("source").insert({ user_id: userId, capture_id: cap!.id, kind: "user_note", extracted_text: "t", content_hash: "h", extractor: "t", extractor_version: "1" }).select("id").single();
  const { data: page } = await db.from("page").insert({ user_id: userId, source_id: src!.id, title: "P" }).select("id").single();
  const { data: claim } = await db.from("claim").insert({ user_id: userId, page_id: page!.id, text: "c", origin: "source" }).select("id").single();
  for (let i = 0; i < n; i++) {
    const { data: card } = await db.from("card").insert({ user_id: userId, claim_id: claim!.id, source_id: src!.id, question: `q${i}?`, answer: "a", status: "active" }).select("id").single();
    await db.from("fsrs_state").insert({ card_id: card!.id, user_id: userId, fsrs_version: "5.4.2", due: new Date(Date.now() - 1000).toISOString(), state: 2, reps: 3, stability: 5 });
  }
}

const reminderJob = (userId: string, date: string) =>
  db.rpc("enqueue_job", { p_user_id: userId, p_capture_id: null, p_stage: "reminder", p_key: `reminder:${userId}:${date}`, p_payload: { local_date: date } });

describe("reminder email", () => {
  it("[R-NOT-01][R-REV-05] is sent when cards are due, with counts and a 24 h signed link", async () => {
    const u = await makeUser(db, "rem");
    await activeCardDue(u.id, 3);
    const { deps, sent } = setup();
    await reminderJob(u.id, "2026-10-14");
    await runWorker(deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(u.email);
    expect(sent[0]!.subject).toBe("3 cartes à réviser aujourd'hui");
    expect(sent[0]!.text).toContain("3 cartes à réviser aujourd'hui");
    expect(sent[0]!.text).toContain("Environ 1 min");
    const link = sent[0]!.text.match(/https:\/\/app\.test\/r\/(\S+)/)![1]!;
    expect(verifyReviewToken(link, SECRET)).toBe(u.id);
    const { data: row } = await db.from("email_out").select("kind,status,dedup_key").eq("user_id", u.id).single();
    expect(row).toEqual({ kind: "reminder", status: "sent", dedup_key: "2026-10-14" });
  });

  it("[R-NOT-03] running the job twice for the same day sends once", async () => {
    const u = await makeUser(db, "once");
    await activeCardDue(u.id);
    const { deps, sent } = setup();
    await reminderJob(u.id, "2026-10-14");
    await runWorker(deps);
    await db.rpc("enqueue_job", { p_user_id: u.id, p_capture_id: null, p_stage: "reminder", p_key: "again-same-day", p_payload: { local_date: "2026-10-14" } });
    await runWorker(deps);
    expect(sent).toHaveLength(1);
  });

  it("[R-NOT-01] sends nothing when there is nothing due and the tray is empty", async () => {
    const u = await makeUser(db, "nothing");
    const { deps, sent } = setup();
    await reminderJob(u.id, "2026-10-14");
    await runWorker(deps);
    expect(sent).toHaveLength(0);
  });

  it("[R-NOT-01] a waiting tray is a reason to send", async () => {
    const u = await makeUser(db, "tray");
    await activeCardDue(u.id, 0);
    const { data: claim } = await db.from("claim").select("id,page_id").eq("user_id", u.id).single();
    const { data: src } = await db.from("source").select("id").eq("user_id", u.id).single();
    await db.from("card").insert({ user_id: u.id, claim_id: claim!.id, source_id: src!.id, question: "q?", answer: "a" });
    const { deps, sent } = setup();
    await reminderJob(u.id, "2026-10-14");
    await runWorker(deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("1 carte à valider t'attend");
  });

  it("[R-SEC-02] fails closed without the link secret: no mail, and the job ends failed after its retries", async () => {
    const u = await makeUser(db, "nosecret");
    await activeCardDue(u.id);
    const { deps, sent } = setup(null);
    await reminderJob(u.id, "2026-10-14");
    for (let i = 0; i < 3; i++) {
      await db.from("job").update({ run_after: new Date().toISOString() }).eq("user_id", u.id).eq("status", "queued");
      await runWorker(deps);
    }
    expect(sent).toHaveLength(0);
    const { data: job } = await db.from("job").select("status").eq("user_id", u.id).eq("stage", "reminder").single();
    expect(job!.status).toBe("failed");
  });

  it("[R-NOT-02] the enqueuer plus the worker deliver one reminder per user at their local 18:00", async () => {
    const paris = await makeUser(db, "paris");
    const la = await makeUser(db, "la");
    await db.from("profile").update({ timezone: "Europe/Paris" }).eq("user_id", paris.id);
    await db.from("profile").update({ timezone: "America/Los_Angeles" }).eq("user_id", la.id);
    await activeCardDue(paris.id);
    await activeCardDue(la.id);
    const { deps, sent } = setup();
    // 2026-10-14 16:05 UTC = 18:05 Paris, 09:05 Los Angeles.
    await db.rpc("enqueue_reminders", { p_now: "2026-10-14T16:05:00Z" });
    await runWorker(deps);
    expect(sent.map((m) => m.to)).toContain(paris.email);
    expect(sent.map((m) => m.to)).not.toContain(la.email);
    // 01:05 UTC next day = 18:05 Los Angeles.
    await db.rpc("enqueue_reminders", { p_now: "2026-10-15T01:05:00Z" });
    await runWorker(deps);
    expect(sent.map((m) => m.to)).toContain(la.email);
    expect(sent.filter((m) => m.to === paris.email)).toHaveLength(1);
  });
});

describe("reminder pause and unsubscribe", () => {
  it("[R-NOT-04] a reminder carries an unsubscribe link and the one-click headers", async () => {
    const u = await makeUser(db, "unsubhdr");
    await activeCardDue(u.id);
    const { deps, sent } = setup();
    await reminderJob(u.id, "2026-10-14");
    await runWorker(deps);
    expect(sent).toHaveLength(1);
    const link = sent[0]!.text.match(/https:\/\/app\.test\/u\/(\S+)/)![1]!;
    expect(verifyUnsubscribeToken(link, SECRET)).toBe(u.id);
    expect(verifyReviewToken(link, SECRET)).toBeNull(); // not a review link
    expect(sent[0]!.headers!["List-Unsubscribe"]).toBe(`<https://app.test/api/unsubscribe/${link}>`);
    expect(sent[0]!.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent[0]!.html).toContain(`/u/${link}`);
  });

  it("[R-NOT-04] no reminder while paused, one again when the pause ends", async () => {
    const u = await makeUser(db, "paused");
    await activeCardDue(u.id);
    await db.from("profile").update({ reminders_paused_until: new Date(Date.now() + 86_400_000).toISOString() }).eq("user_id", u.id);
    const { deps, sent } = setup();
    await reminderJob(u.id, "2026-10-14");
    await runWorker(deps);
    expect(sent).toHaveLength(0);
    await db.from("profile").update({ reminders_paused_until: new Date(Date.now() - 1000).toISOString() }).eq("user_id", u.id);
    await reminderJob(u.id, "2026-10-15");
    await runWorker(deps);
    expect(sent).toHaveLength(1);
  });

  it("[R-NOT-04] no reminder once unsubscribed, and the job still ends cleanly", async () => {
    const u = await makeUser(db, "off");
    await activeCardDue(u.id);
    await db.from("profile").update({ reminders_off: true }).eq("user_id", u.id);
    const { deps, sent } = setup();
    await reminderJob(u.id, "2026-10-14");
    await runWorker(deps);
    expect(sent).toHaveLength(0);
    const { data: job } = await db.from("job").select("status").eq("user_id", u.id).eq("stage", "reminder").single();
    expect(job!.status).toBe("done");
  });
});
