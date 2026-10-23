import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localSupabaseEnv } from "../e2e/local-env";

const env = localSupabaseEnv();

/** Service-role client for the LOCAL stack. Refuses anything that is not localhost. */
export function localAdmin(): SupabaseClient {
  if (!env.SUPABASE_URL?.startsWith("http://127.0.0.1")) throw new Error("Integration tests only run against the local stack");
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export async function makeUser(db: SupabaseClient, tag: string) {
  // Jobs left queued by an earlier test (retries waiting out their back-off) must not be claimed by this test's worker.
  await db.from("job").delete().in("status", ["queued", "running"]);
  const email = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const { data: addr } = await db.from("capture_address").select("token").eq("user_id", data.user.id).single();
  return { id: data.user.id, email, token: addr!.token as string };
}

export const SECRET_BYTES = "integration-secret-bytes";
export const WEBHOOK_SECRET = "whsec_" + Buffer.from(SECRET_BYTES).toString("base64");

/** Builds a Resend-shaped, correctly signed webhook request. */
export function signedWebhook(payload: object, svixId = `msg_${Math.random().toString(36).slice(2)}`) {
  const body = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = "v1," + createHmac("sha256", Buffer.from(SECRET_BYTES)).update(`${svixId}.${ts}.${body}`).digest("base64");
  return { body, headers: new Headers({ "svix-id": svixId, "svix-timestamp": ts, "svix-signature": sig }) };
}

export const receivedEvent = (o: { emailId: string; from: string; token: string; subject?: string }) => ({
  type: "email.received",
  created_at: new Date().toISOString(),
  data: { email_id: o.emailId, from: o.from, to: [`${o.token}@abc123.resend.app`], subject: o.subject ?? "note" },
});
