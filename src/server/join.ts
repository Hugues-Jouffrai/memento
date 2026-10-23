import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { INVITE_CODE_BYTES, JOIN_LIMIT_PER_EMAIL, JOIN_LIMIT_PER_IP, JOIN_WINDOW_SECONDS, isInviteCode } from "@/domain/invite";

export const newInviteCode = () => randomBytes(INVITE_CODE_BYTES).toString("base64url");
export const hashSecret = (s: string) => createHash("sha256").update(s).digest("hex");

export type JoinResult = "sent" | "invalid" | "rate_limited" | "failed";

/**
 * R-ACC-02 / D52: an address joins with the universal invite link. The answer is the same whether the address
 * already had an account or not. The account is created confirmed (Auth refuses to mail a code to an unconfirmed
 * account while sign-ups are closed). Owning the address is still proven by the sign-in mail, and `add@` only takes
 * mail whose DKIM passes.
 * `sendSignIn` mails the sign-in link and code (in the app: Supabase `signInWithOtp`, `shouldCreateUser: false`).
 */
export async function joinWithInvite(
  db: SupabaseClient,
  input: { code: unknown; email: string; ip: string | null },
  sendSignIn: (email: string) => Promise<"ok" | "rate_limited" | "failed">,
): Promise<JoinResult> {
  const email = input.email.trim().toLowerCase();
  // Limits first, so a wrong code costs the caller a request too.
  const byEmail = await db.rpc("rate_check", { p_key: `join:email:${hashSecret(email)}`, p_limit: JOIN_LIMIT_PER_EMAIL, p_window_seconds: JOIN_WINDOW_SECONDS });
  const byIp = await db.rpc("rate_check", { p_key: `join:ip:${hashSecret(input.ip ?? "unknown")}`, p_limit: JOIN_LIMIT_PER_IP, p_window_seconds: JOIN_WINDOW_SECONDS });
  if (byEmail.error || byIp.error) return "failed";
  if (!byEmail.data || !byIp.data) return "rate_limited";

  if (!isInviteCode(input.code)) return "invalid";
  const redeemed = await db.rpc("redeem_invite", { p_code_hash: hashSecret(input.code), p_email: email });
  if (redeemed.error) return "failed";
  if (redeemed.data === "invalid") return "invalid";

  if (redeemed.data === "ok") {
    const created = await db.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) {
      await db.rpc("release_invite", { p_email: email });
      return "failed";
    }
  }
  const sent = await sendSignIn(email);
  return sent === "ok" ? "sent" : sent;
}
