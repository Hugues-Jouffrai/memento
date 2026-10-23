// Manages the universal invite link (D52, R-ACC-02). The code is shown once, only its hash is stored.
// Usage (env from .env.local, APP_URL must be set):
//   pnpm tsx --env-file=.env.local scripts/invite.ts create [--label beta1] [--max 30] [--days 30]
//   pnpm tsx --env-file=.env.local scripts/invite.ts list
//   pnpm tsx --env-file=.env.local scripts/invite.ts revoke <id>
import { inviteExpiry, parseInviteArgs } from "../src/domain/invite";
import { hashSecret, newInviteCode } from "../src/server/join";
import { createAdminClient } from "../src/supabase/admin";

const [cmd, ...rest] = process.argv.slice(2);
const db = createAdminClient();

if (cmd === "create") {
  const parsed = parseInviteArgs(rest);
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exit(1);
  }
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
  if (!appUrl) {
    console.error("APP_URL is not set");
    process.exit(1);
  }
  const code = newInviteCode();
  const expires = inviteExpiry(new Date(), parsed.value.days);
  const { data, error } = await db
    .from("invite_code")
    .insert({ code_hash: hashSecret(code), label: parsed.label, max_uses: parsed.value.maxUses, expires_at: expires.toISOString() })
    .select("id")
    .single();
  if (error) {
    console.error(`Failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Invite ${data.id}: up to ${parsed.value.maxUses} sign-ups until ${expires.toISOString().slice(0, 10)}.`);
  console.log(`${appUrl}/join/${code}`);
  console.log("This link is shown once. Revoke it with: revoke " + data.id);
} else if (cmd === "list") {
  const { data, error } = await db.from("invite_code").select("id,label,uses,max_uses,expires_at,revoked_at,created_at").order("created_at", { ascending: false });
  if (error) {
    console.error(`Failed: ${error.message}`);
    process.exit(1);
  }
  for (const r of data) {
    const state = r.revoked_at ? "revoked" : new Date(r.expires_at) < new Date() ? "expired" : r.uses >= r.max_uses ? "used up" : "open";
    console.log(`${r.id}  ${state.padEnd(8)} ${r.uses}/${r.max_uses}  until ${r.expires_at.slice(0, 10)}  ${r.label ?? ""}`);
  }
} else if (cmd === "revoke" && rest[0]) {
  const { data, error } = await db.from("invite_code").update({ revoked_at: new Date().toISOString() }).eq("id", rest[0]).is("revoked_at", null).select("id");
  if (error || !data?.length) {
    console.error(error ? `Failed: ${error.message}` : "No open invite with this id");
    process.exit(1);
  }
  console.log(`Revoked ${rest[0]}`);
} else {
  console.error("Usage: invite.ts create [--label x] [--max n] [--days n] | list | revoke <id>");
  process.exit(1);
}
