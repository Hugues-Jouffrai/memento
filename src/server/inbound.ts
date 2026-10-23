import type { SupabaseClient } from "@supabase/supabase-js";
import { captureTokenFrom, isAcceptedSender, isSharedCaptureAddress, parseAddress } from "@/domain/capture";
import { receivingDomain } from "./config";
import { verifySvix } from "./svix";

export interface InboundDeps {
  db: SupabaseClient;
  webhookSecret: string | undefined;
  /** Called after a job was enqueued, to start the worker without waiting for the backstop. */
  kick?: () => void;
  /** Domain of `add@<domain>` (R-CAP-12). Defaults to RESEND_RECEIVING_DOMAIN. */
  receivingDomain?: string | null;
}

export interface InboundResult {
  status: number;
  body: { result: string };
}

interface ResendReceived {
  type?: string;
  data?: { email_id?: string; from?: string; to?: string[]; received_for?: string[]; subject?: string };
}

const reply = (status: number, result: string): InboundResult => ({ status, body: { result } });

/**
 * Resend `email.received` webhook. Order matters (R-CAP-04): verify, store the raw capture, enqueue, answer.
 * Body, attachments and the DKIM result are fetched later by the `fetch` job (the webhook carries metadata only, D25).
 *
 * Routing (D50): a token address names the user and the From must be that user's account email (R-CAP-01, R-CAP-02);
 * otherwise `add@<capture domain>` names the user by the From address (R-CAP-12). DKIM is checked in `fetch`, before
 * any AI call (R-CAP-03).
 */
export async function handleInbound(rawBody: string, headers: Headers, deps: InboundDeps): Promise<InboundResult> {
  const verified = verifySvix({
    id: headers.get("svix-id"),
    timestamp: headers.get("svix-timestamp"),
    signature: headers.get("svix-signature"),
    body: rawBody,
    secret: deps.webhookSecret,
  });
  if (!verified) return reply(401, "unauthorized");

  let event: ResendReceived;
  try {
    event = JSON.parse(rawBody) as ResendReceived;
  } catch {
    return reply(400, "bad_json");
  }
  if (event.type !== "email.received" || !event.data?.email_id) return reply(200, "ignored");
  const { email_id: emailId, from = "", to = [], received_for: receivedFor = [], subject = null } = event.data;
  const recipients = [...to, ...receivedFor];

  let userId: string;
  let accepted: boolean;
  let route: "token" | "shared";
  const token = captureTokenFrom(recipients);
  if (token) {
    route = "token";
    const { data: addr } = await deps.db.from("capture_address").select("user_id").eq("token", token).maybeSingle();
    if (!addr) return reply(200, "unknown_token");
    userId = addr.user_id as string;
    const { data: userRes } = await deps.db.auth.admin.getUserById(userId);
    accepted = isAcceptedSender(from, userRes.user?.email ?? "");
  } else {
    const domain = deps.receivingDomain === undefined ? receivingDomain() : deps.receivingDomain;
    if (!isSharedCaptureAddress(recipients, domain)) return reply(200, "no_token");
    route = "shared";
    const sender = parseAddress(from);
    const { data: found, error: lookupError } = sender
      ? await deps.db.rpc("capture_user_by_email", { p_email: sender })
      : { data: null, error: null };
    if (lookupError) return reply(500, "lookup_failed"); // Resend retries on non-2xx (D25).
    if (!found) {
      // Nobody to attach it to: nothing is stored and nobody is answered (no backscatter). No body, no address logged.
      console.info(JSON.stringify({ event: "inbound_unknown_sender", email_id: emailId, sender_domain: sender?.split("@")[1] ?? null }));
      return reply(200, "unknown_sender");
    }
    userId = found as string;
    accepted = true; // The From is this user's account email by construction; DKIM decides in `fetch`.
  }

  const { data: capture, error } = await deps.db
    .from("capture")
    .insert({
      user_id: userId,
      provider_message_id: emailId,
      from_address: parseAddress(from) ?? from.slice(0, 320),
      subject,
      status: accepted ? "received" : "rejected",
      route,
      raw: event,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return reply(200, "duplicate");
    return reply(500, "store_failed"); // Resend retries on non-2xx (D25).
  }
  if (!accepted) return reply(200, "rejected");

  const { error: jobError } = await deps.db.rpc("enqueue_job", {
    p_user_id: userId,
    p_capture_id: capture.id,
    p_stage: "fetch",
    p_key: `capture:${capture.id}:fetch`,
  });
  if (jobError) return reply(500, "enqueue_failed");
  deps.kick?.();
  return reply(200, "accepted");
}
