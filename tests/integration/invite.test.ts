import { beforeAll, describe, expect, it } from "vitest";
import { inviteExpiry } from "@/domain/invite";
import { hashSecret, joinWithInvite, newInviteCode } from "@/server/join";
import { localSupabaseEnv } from "../e2e/local-env";
import { localAdmin, makeUser } from "./support";

const db = localAdmin();
const ok = async () => "ok" as const;
const mail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
let ipCounter = 0;
const ip = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

async function makeInvite(o: { max?: number; days?: number; revoked?: boolean } = {}) {
  const code = newInviteCode();
  const expires = o.days === undefined ? inviteExpiry(new Date(), 30) : new Date(Date.now() + o.days * 86_400_000);
  const { data, error } = await db
    .from("invite_code")
    .insert({ code_hash: hashSecret(code), max_uses: o.max ?? 30, expires_at: expires.toISOString(), revoked_at: o.revoked ? new Date().toISOString() : null })
    .select("id")
    .single();
  if (error) throw error;
  return { code, id: data.id as string };
}
const uses = async (id: string) => (await db.from("invite_code").select("uses").eq("id", id).single()).data!.uses as number;
const userByEmail = async (email: string) => (await db.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === email);

beforeAll(async () => {
  await db.from("rate_hit").delete().neq("key", "");
});

describe("[R-ACC-02] universal invite link", () => {
  it("a valid code creates an account and sends the sign-in mail", async () => {
    const inv = await makeInvite();
    const email = mail("join");
    const sent: string[] = [];
    const r = await joinWithInvite(db, { code: inv.code, email, ip: ip() }, async (to) => (sent.push(to), "ok"));
    expect(r).toBe("sent");
    expect(sent).toEqual([email]);
    const user = await userByEmail(email);
    expect(user).toBeTruthy();
    expect(await uses(inv.id)).toBe(1);
    const { data: prof } = await db.from("profile").select("user_id").eq("user_id", user!.id);
    expect(prof).toHaveLength(1);
  });

  it("the stored code is a hash: the code itself appears nowhere in the table", async () => {
    const inv = await makeInvite();
    const { data } = await db.from("invite_code").select("*").eq("id", inv.id).single();
    expect(JSON.stringify(data)).not.toContain(inv.code);
  });

  it("an unknown, expired, revoked or used-up code is refused and creates no account", async () => {
    const expired = await makeInvite({ days: -1 });
    const revoked = await makeInvite({ revoked: true });
    const full = await makeInvite({ max: 1 });
    await joinWithInvite(db, { code: full.code, email: mail("first"), ip: ip() }, ok);
    for (const code of [newInviteCode(), expired.code, revoked.code, full.code, "not-a-code"]) {
      const email = mail("refused");
      expect(await joinWithInvite(db, { code, email, ip: ip() }, ok)).toBe("invalid");
      expect(await userByEmail(email)).toBeUndefined();
    }
  });

  it("never takes more uses than allowed, even with simultaneous requests", async () => {
    const inv = await makeInvite({ max: 3 });
    const results = await Promise.all(Array.from({ length: 10 }, () => joinWithInvite(db, { code: inv.code, email: mail("race"), ip: ip() }, ok)));
    expect(results.filter((r) => r === "sent")).toHaveLength(3);
    expect(results.filter((r) => r === "invalid")).toHaveLength(7);
    expect(await uses(inv.id)).toBe(3);
  });

  it("an address that already has an account just gets a sign-in mail and consumes nothing", async () => {
    const inv = await makeInvite();
    const u = await makeUser(db, "existing");
    const sent: string[] = [];
    expect(await joinWithInvite(db, { code: inv.code, email: u.email, ip: ip() }, async (to) => (sent.push(to), "ok"))).toBe("sent");
    expect(sent).toEqual([u.email]);
    expect(await uses(inv.id)).toBe(0);
  });

  it("the same address twice uses the invite once", async () => {
    const inv = await makeInvite();
    const email = mail("twice");
    await joinWithInvite(db, { code: inv.code, email, ip: ip() }, ok);
    await joinWithInvite(db, { code: inv.code, email, ip: ip() }, ok);
    expect(await uses(inv.id)).toBe(1);
  });

  it("an address is case-insensitive", async () => {
    const inv = await makeInvite();
    const email = mail("case");
    await joinWithInvite(db, { code: inv.code, email, ip: ip() }, ok);
    await joinWithInvite(db, { code: inv.code, email: email.toUpperCase(), ip: ip() }, ok);
    expect(await uses(inv.id)).toBe(1);
  });

  it("a use is given back when the account cannot be created", async () => {
    const inv = await makeInvite();
    const bad = "x@" + "y".repeat(300) + ".test"; // Auth refuses it
    const r = await joinWithInvite(db, { code: inv.code, email: bad, ip: ip() }, ok);
    expect(r).toBe("failed");
    expect(await uses(inv.id)).toBe(0);
    const { data } = await db.from("invite_use").select("id").eq("invite_id", inv.id);
    expect(data).toHaveLength(0);
  });

  it("the sixth request for one address within the hour is limited", async () => {
    const inv = await makeInvite();
    const email = mail("limit");
    const results: string[] = [];
    for (let i = 0; i < 6; i++) results.push(await joinWithInvite(db, { code: inv.code, email, ip: ip() }, ok));
    expect(results.slice(0, 5).every((r) => r === "sent")).toBe(true);
    expect(results[5]).toBe("rate_limited");
  });

  it("one network address is limited too, whatever the email", async () => {
    const inv = await makeInvite();
    const same = ip();
    const results: string[] = [];
    for (let i = 0; i < 21; i++) results.push(await joinWithInvite(db, { code: inv.code, email: mail("ipl"), ip: same }, ok));
    expect(results.slice(0, 20).every((r) => r === "sent")).toBe(true);
    expect(results[20]).toBe("rate_limited");
  });

  it("counters keep hashes, not addresses", async () => {
    const email = mail("hashed");
    const a = ip();
    await joinWithInvite(db, { code: "nope", email, ip: a }, ok);
    const { data } = await db.from("rate_hit").select("key").like("key", "join:%");
    const keys = JSON.stringify(data);
    expect(keys).not.toContain(email);
    expect(keys).not.toContain(a);
  });

  it("invite tables and functions are closed to signed-in users", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const u = await makeUser(db, "closed");
    const anon = createClient(localSupabaseEnv().SUPABASE_URL!, localSupabaseEnv().SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    expect((await anon.from("invite_code").select("id")).data ?? []).toEqual([]);
    expect((await anon.rpc("redeem_invite", { p_code_hash: "a".repeat(64), p_email: u.email })).error).not.toBeNull();
  });
});
