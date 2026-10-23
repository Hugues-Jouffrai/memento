import { describe, expect, it } from "vitest";
import { runWorker } from "@/server/worker";
import { makeUser } from "./support";
import { byStage, cardsReply, claimsReply, db, deliver, mail, setup } from "./pipeline-support";

const spend = (userId: string, usd: number, at = new Date()) =>
  db.from("ai_call").insert({ user_id: userId, stage: "cards", provider: "fake", model: "m", prompt_version: "v", attempt: 1, status: "ok", cost_usd: usd, at: at.toISOString() });

describe("[D53] per-user AI cost cap", () => {
  it("a user over the day cap has the job held without losing an attempt, and is told once", async () => {
    const u = await makeUser(db, "capday");
    await spend(u.id, 0.31);
    const { deps, sent } = setup({ mails: { "cap-1": mail() }, replies: [byStage(claimsReply, cardsReply(4))] });
    await deliver(u, "cap-1");
    let deferred = 0;
    for (let i = 0; i < 4; i++) {
      await db.from("job").update({ run_after: new Date().toISOString() }).eq("user_id", u.id).eq("status", "queued");
      deferred += (await runWorker(deps)).deferred;
    }
    expect(deferred).toBeGreaterThan(0);
    const { count } = await db.from("ai_call").select("*", { count: "exact", head: true }).eq("user_id", u.id);
    expect(count).toBe(1); // only the seeded row: no AI call was made
    const { data: jobs } = await db.from("job").select("stage,status,attempts,run_after").eq("user_id", u.id).eq("stage", "extract");
    expect(jobs).toHaveLength(1);
    expect(jobs![0]).toMatchObject({ status: "queued", attempts: 0 });
    expect(new Date(jobs![0]!.run_after).getTime()).toBeGreaterThan(Date.now() - 1000);
    const notices = sent.filter((m) => m.subject.includes("attente"));
    expect(notices).toHaveLength(1); // one notice per day, however many holds
    const { data: cap } = await db.from("capture").select("status").eq("user_id", u.id).single();
    expect(cap!.status).not.toBe("failed");
  });

  it("when the spend ages out of the window the held note is processed", async () => {
    const u = await makeUser(db, "capage");
    await spend(u.id, 0.31);
    const { deps } = setup({ mails: { "cap-2": mail() }, replies: [byStage(claimsReply, cardsReply(4))] });
    await deliver(u, "cap-2");
    await db.from("job").update({ run_after: new Date().toISOString() }).eq("user_id", u.id).eq("status", "queued");
    expect((await runWorker(deps)).deferred).toBeGreaterThan(0);
    await db.from("ai_call").update({ at: new Date(Date.now() - 25 * 3_600_000).toISOString() }).eq("user_id", u.id);
    for (let i = 0; i < 6; i++) {
      await db.from("job").update({ run_after: new Date().toISOString() }).eq("user_id", u.id).eq("status", "queued");
      if ((await runWorker(deps)).claimed === 0) break;
    }
    const { data: cap } = await db.from("capture").select("status").eq("user_id", u.id).single();
    expect(cap!.status).toBe("done");
  });

  it("the month cap holds even when today is quiet", async () => {
    const u = await makeUser(db, "capmonth");
    for (let d = 2; d < 12; d++) await spend(u.id, 0.31, new Date(Date.now() - d * 86_400_000));
    const { deps } = setup({ mails: { "cap-3": mail() }, replies: [byStage(claimsReply, cardsReply(4))] });
    await deliver(u, "cap-3");
    await db.from("job").update({ run_after: new Date().toISOString() }).eq("user_id", u.id).eq("status", "queued");
    expect((await runWorker(deps)).deferred).toBeGreaterThan(0);
  });

  it("another user is not held by someone else's spend", async () => {
    const a = await makeUser(db, "capa");
    const b = await makeUser(db, "capb");
    await spend(a.id, 5);
    const { deps } = setup({ mails: { "cap-4": mail() }, replies: [byStage(claimsReply, cardsReply(4))] });
    await deliver(b, "cap-4");
    for (let i = 0; i < 6; i++) {
      await db.from("job").update({ run_after: new Date().toISOString() }).eq("user_id", b.id).eq("status", "queued");
      if ((await runWorker(deps)).claimed === 0) break;
    }
    const { data: cap } = await db.from("capture").select("status").eq("user_id", b.id).single();
    expect(cap!.status).toBe("done");
  });

  it("a user cannot raise their own cap", async () => {
    const u = await makeUser(db, "caphack");
    const { createClient } = await import("@supabase/supabase-js");
    const { localSupabaseEnv } = await import("../e2e/local-env");
    const env = localSupabaseEnv();
    const anon = createClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    await db.auth.admin.updateUserById(u.id, { password: "Correct-horse-battery-1" });
    await anon.auth.signInWithPassword({ email: u.email, password: "Correct-horse-battery-1" });
    const { error } = await anon.from("profile").update({ ai_cap_day_usd: 999 }).eq("user_id", u.id);
    expect(error).not.toBeNull();
    const { data } = await db.from("profile").select("ai_cap_day_usd").eq("user_id", u.id).single();
    expect(Number(data!.ai_cap_day_usd)).toBe(0.3);
  });
});
