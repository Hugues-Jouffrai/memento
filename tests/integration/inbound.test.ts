import { describe, expect, it } from "vitest";
import { handleInbound } from "@/server/inbound";
import { localAdmin, makeUser, receivedEvent, signedWebhook, WEBHOOK_SECRET } from "./support";

const db = localAdmin();
const deps = (kick?: () => void) => ({ db, webhookSecret: WEBHOOK_SECRET, kick });

describe("inbound webhook", () => {
  it("[R-CAP-01][R-CAP-04] stores the raw capture and enqueues a fetch job", async () => {
    const u = await makeUser(db, "ok");
    let kicked = 0;
    const { body, headers } = signedWebhook(receivedEvent({ emailId: "e-ok", from: `Me <${u.email}>`, token: u.token }));
    const res = await handleInbound(body, headers, deps(() => kicked++));
    expect(res).toEqual({ status: 200, body: { result: "accepted" } });
    const { data: cap } = await db.from("capture").select("*").eq("user_id", u.id).single();
    expect(cap).toMatchObject({ status: "received", provider_message_id: "e-ok", from_address: u.email });
    expect(cap!.raw.data.email_id).toBe("e-ok");
    const { data: jobs } = await db.from("job").select("stage,status").eq("capture_id", cap!.id);
    expect(jobs).toEqual([{ stage: "fetch", status: "queued" }]);
    expect(kicked).toBe(1);
  });

  it("[R-CAP-02] a foreign sender is stored as rejected: no job, no kick", async () => {
    const u = await makeUser(db, "foreign");
    let kicked = 0;
    const { body, headers } = signedWebhook(receivedEvent({ emailId: "e-f", from: "evil@example.org", token: u.token }));
    expect(await handleInbound(body, headers, deps(() => kicked++))).toEqual({ status: 200, body: { result: "rejected" } });
    const { data: cap } = await db.from("capture").select("id,status").eq("user_id", u.id).single();
    expect(cap!.status).toBe("rejected");
    const { count } = await db.from("job").select("*", { count: "exact", head: true }).eq("capture_id", cap!.id);
    expect(count).toBe(0);
    expect(kicked).toBe(0);
  });

  it("[R-CAP-05] delivering the same message twice gives one capture and one job", async () => {
    const u = await makeUser(db, "dup");
    const ev = receivedEvent({ emailId: "e-dup", from: u.email, token: u.token });
    const first = signedWebhook(ev);
    const second = signedWebhook(ev); // Resend retry: new signature, same email id
    expect((await handleInbound(first.body, first.headers, deps())).body.result).toBe("accepted");
    expect((await handleInbound(second.body, second.headers, deps())).body.result).toBe("duplicate");
    const { count: caps } = await db.from("capture").select("*", { count: "exact", head: true }).eq("user_id", u.id);
    const { count: jobs } = await db.from("job").select("*", { count: "exact", head: true }).eq("user_id", u.id);
    expect([caps, jobs]).toEqual([1, 1]);
  });

  it("[R-SEC-02] a bad signature, a missing secret and an unsigned request are refused and store nothing", async () => {
    const u = await makeUser(db, "sig");
    const { body, headers } = signedWebhook(receivedEvent({ emailId: "e-s", from: u.email, token: u.token }));
    const tampered = await handleInbound(body + " ", headers, deps());
    const noSecret = await handleInbound(body, headers, { db, webhookSecret: undefined });
    const emptySecret = await handleInbound(body, headers, { db, webhookSecret: "" });
    const unsigned = await handleInbound(body, new Headers(), deps());
    expect([tampered.status, noSecret.status, emptySecret.status, unsigned.status]).toEqual([401, 401, 401, 401]);
    const { count } = await db.from("capture").select("*", { count: "exact", head: true }).eq("user_id", u.id);
    expect(count).toBe(0);
  });

  it("an unknown token or a different event type is ignored with 200", async () => {
    const unknown = signedWebhook(receivedEvent({ emailId: "e-u", from: "a@b.c", token: "f".repeat(20) }));
    expect((await handleInbound(unknown.body, unknown.headers, deps())).body.result).toBe("unknown_token");
    const other = signedWebhook({ type: "email.sent", data: {} });
    expect((await handleInbound(other.body, other.headers, deps())).body.result).toBe("ignored");
  });
});
