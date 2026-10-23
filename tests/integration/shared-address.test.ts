import { describe, expect, it } from "vitest";
import { handleInbound } from "@/server/inbound";
import type { ReceivedMail } from "@/server/ports";
import { makeUser, signedWebhook, WEBHOOK_SECRET } from "./support";
import { byStage, captureOf, cardsReply, claimsReply, db, drain, mail, setup } from "./pipeline-support";

const DOMAIN = "mailtomemento.com";
const uid = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Delivers a signed `email.received` event to the given recipients (D50: add@ or a token address). */
async function deliverTo(to: string[], emailId: string, from: string) {
  const { body, headers } = signedWebhook({
    type: "email.received",
    created_at: new Date().toISOString(),
    data: { email_id: emailId, from, to, subject: "note" },
  });
  return handleInbound(body, headers, { db, webhookSecret: WEBHOOK_SECRET, receivingDomain: DOMAIN });
}

const withDkim = (dkim: string | null): ReceivedMail => ({
  ...mail(),
  authentication: dkim === null ? null : { spf: "pass", dkim, dmarc: "gray" },
});

const count = async (table: string, col: string, value: string) =>
  (await db.from(table).select("*", { count: "exact", head: true }).eq(col, value)).count;

async function stagesOf(captureId: string) {
  const { data } = await db.from("job").select("stage,status").eq("capture_id", captureId).order("created_at");
  return data!.map((j) => `${j.stage}:${j.status}`);
}

describe("[R-CAP-12] shared address add@ routed by the authenticated From", () => {
  it("[R-CAP-12] the account From with dkim=pass creates a capture and a job, and is processed", async () => {
    const u = await makeUser(db, "shared-ok");
    const id = uid("e-sh");
    const { deps, sent } = setup({ mails: { [id]: withDkim("pass") }, replies: [byStage(claimsReply, cardsReply(2))] });
    // Display name and case do not matter; the domain may be written in any case.
    const res = await deliverTo([`Memento <ADD@MailToMemento.com>`], id, `Me <${u.email.toUpperCase()}>`);
    expect(res.body.result).toBe("accepted");
    const cap = await captureOf(u.id, id);
    expect(cap).toMatchObject({ status: "received", route: "shared", from_address: u.email });
    expect(await stagesOf(cap.id)).toEqual(["fetch:queued"]);

    await drain(deps, u.id);
    const done = await captureOf(u.id, id);
    expect(done.status).toBe("done");
    expect(done.auth).toMatchObject({ dkim: "pass", spf: "pass", dmarc: "gray", route: "shared", decision: "accept" });
    expect(await count("ai_call", "user_id", u.id)).toBeGreaterThan(0);
    expect(sent).toHaveLength(0);
  });

  it("[R-CAP-12][R-CAP-03] dkim gray, fail, processing_failed, unknown or missing: rejected, no further job, no AI call, no mail", async () => {
    const u = await makeUser(db, "shared-bad");
    const cases = ["gray", "fail", "processing_failed", "unknown", null] as const;
    const ids = Object.fromEntries(cases.map((d) => [String(d), uid(`e-${d}`)]));
    const { deps, sent } = setup({
      mails: Object.fromEntries(cases.map((d) => [ids[String(d)]!, withDkim(d)])),
      replies: [byStage(claimsReply, cardsReply(2))],
    });
    for (const d of cases) expect((await deliverTo([`add@${DOMAIN}`], ids[String(d)]!, u.email)).body.result).toBe("accepted");
    await drain(deps, u.id);
    for (const d of cases) {
      const cap = await captureOf(u.id, ids[String(d)]!);
      expect([d, cap.status, cap.error]).toEqual([d, "rejected", `dkim_${d ?? "missing"}`]);
      expect(cap.auth).toMatchObject({ dkim: d, route: "shared", decision: "reject" });
      expect(await stagesOf(cap.id)).toEqual(["fetch:done"]);
    }
    expect(await count("ai_call", "user_id", u.id)).toBe(0);
    expect(await count("source", "user_id", u.id)).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("[R-CAP-12] dkim still processing: retried through the queue, then rejected on the last attempt", async () => {
    const u = await makeUser(db, "shared-proc");
    const id = uid("e-proc");
    const { deps } = setup({ mails: { [id]: withDkim("processing") }, replies: [byStage(claimsReply, cardsReply(2))] });
    await deliverTo([`add@${DOMAIN}`], id, u.email);
    await drain(deps, u.id, 6);
    const cap = await captureOf(u.id, id);
    expect([cap.status, cap.error]).toEqual(["rejected", "dkim_processing"]);
    const { data: job } = await db.from("job").select("status,attempts").eq("capture_id", cap.id).single();
    expect(job).toEqual({ status: "done", attempts: 3 });
    expect(await count("ai_call", "user_id", u.id)).toBe(0);
  });

  it("[R-CAP-12] an unknown From creates no row and no job", async () => {
    const id = uid("e-unknown");
    const res = await deliverTo([`add@${DOMAIN}`], id, `nobody-${id}@example.test`);
    expect(res).toEqual({ status: 200, body: { result: "unknown_sender" } });
    expect(await count("capture", "provider_message_id", id)).toBe(0);
    const garbage = await deliverTo([`add@${DOMAIN}`], uid("e-garbage"), "not an address");
    expect(garbage.body.result).toBe("unknown_sender");
  });

  it("[R-CAP-12] add+tag@ and add@ on a foreign domain are not the shared address: nothing stored", async () => {
    const u = await makeUser(db, "shared-plus");
    const a = uid("e-plus");
    const b = uid("e-foreign");
    expect((await deliverTo([`add+x@${DOMAIN}`], a, u.email)).body.result).toBe("no_token");
    expect((await deliverTo(["add@other-service.com"], b, u.email)).body.result).toBe("no_token");
    expect(await count("capture", "user_id", u.id)).toBe(0);
  });

  it("[R-CAP-12][R-CAP-02] another user's email cannot reach that user through a different account's token", async () => {
    const a = await makeUser(db, "owner-a");
    const b = await makeUser(db, "victim-b");
    const id = uid("e-cross");
    expect((await deliverTo([`${a.token}@${DOMAIN}`], id, b.email)).body.result).toBe("rejected");
    expect(await count("capture", "user_id", b.id)).toBe(0);
    const cap = await captureOf(a.id, id);
    expect(cap).toMatchObject({ status: "rejected", route: "token" });
    expect(await count("job", "capture_id", cap.id)).toBe(0);
  });

  it("[R-CAP-12] add@ routes to the sender's own account only", async () => {
    const a = await makeUser(db, "route-a");
    const b = await makeUser(db, "route-b");
    const id = uid("e-route");
    expect((await deliverTo([`add@${DOMAIN}`], id, b.email)).body.result).toBe("accepted");
    expect(await count("capture", "user_id", a.id)).toBe(0);
    expect((await captureOf(b.id, id)).route).toBe("shared");
  });
});

describe("[R-CAP-03] token path: only dkim=fail is refused", () => {
  it("[R-CAP-03] dkim fail is rejected before any AI call; gray and pass are processed", async () => {
    const u = await makeUser(db, "token-dkim");
    const ids = { fail: uid("e-tf"), gray: uid("e-tg"), pass: uid("e-tp") };
    const { deps, sent } = setup({
      mails: {
        [ids.fail]: withDkim("fail"),
        // Different texts so the dedup (R-PIPE-03) does not end the second one as a duplicate.
        [ids.gray]: { ...mail(), authentication: { dkim: "gray" } },
        [ids.pass]: { ...mail("Les fourmis suivent des traces de phéromones laissées par leurs congénères pour trouver la nourriture.", "Les fourmis"), authentication: { dkim: "pass" } },
      },
      replies: [byStage(claimsReply, cardsReply(2))],
    });
    expect((await deliverTo([`${u.token}@${DOMAIN}`], ids.fail, u.email)).body.result).toBe("accepted");
    await drain(deps, u.id);
    const failed = await captureOf(u.id, ids.fail);
    expect([failed.status, failed.error, failed.route]).toEqual(["rejected", "dkim_fail", "token"]);
    expect(await count("ai_call", "user_id", u.id)).toBe(0);
    expect(sent).toHaveLength(0);

    await deliverTo([`${u.token}@abc123.resend.app`], ids.gray, u.email);
    await deliverTo([`${u.token}@${DOMAIN}`], ids.pass, u.email);
    await drain(deps, u.id);
    expect((await captureOf(u.id, ids.gray)).auth).toMatchObject({ dkim: "gray", decision: "accept", route: "token" });
    expect((await captureOf(u.id, ids.gray)).status).not.toBe("rejected");
    expect((await captureOf(u.id, ids.pass)).status).not.toBe("rejected");
    expect(await count("ai_call", "user_id", u.id)).toBeGreaterThan(0);
  });
});

describe("[R-CAP-01] token addresses keep working", () => {
  it("[R-CAP-01] resend.app and mailtomemento.com token addresses are both accepted", async () => {
    const u = await makeUser(db, "token-both");
    const a = uid("e-ra");
    const b = uid("e-mm");
    expect((await deliverTo([`${u.token}@abc123.resend.app`], a, u.email)).body.result).toBe("accepted");
    expect((await deliverTo([`${u.token}@${DOMAIN}`], b, u.email)).body.result).toBe("accepted");
    expect((await captureOf(u.id, a)).route).toBe("token");
    expect((await captureOf(u.id, b)).route).toBe("token");
  });
});
