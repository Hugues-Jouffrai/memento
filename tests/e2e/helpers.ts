import { createClient } from "@supabase/supabase-js";
import { localSupabaseEnv } from "./local-env";

const env = localSupabaseEnv();

export function admin() {
  return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export function anon() {
  return createClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
}

/** Creates a confirmed user. The walkthrough (R-ONB-07) is marked done unless the test is about it: `{ welcome: true }`. */
export async function createUser(email: string, opts: { welcome?: boolean } = {}): Promise<string> {
  const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  if (!opts.welcome) {
    const { error: e } = await admin().from("profile").update({ welcome_done_at: new Date().toISOString() }).eq("user_id", data.user.id);
    if (e) throw e;
  }
  return data.user.id;
}

export function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** Polls Mailpit for the newest mail to `to`; returns its text body and the first link. */
export async function waitForMail(to: string, timeoutMs = 20_000): Promise<{ text: string; subject: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await (await fetch(`${env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    const first = list.messages?.[0];
    if (first) {
      const msg = await (await fetch(`${env.MAILPIT_URL}/api/v1/message/${first.ID}`)).json();
      return { text: msg.Text as string, subject: msg.Subject as string };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No mail for ${to}`);
}

export const codeFrom = (text: string): string => text.match(/\b(\d{6})\b/)?.[1] ?? "";
export const linkFrom = (text: string): string => text.match(/https?:\/\/\S+/)![0].replace(/[)>\]]+$/, "");

export const REVIEW_LINK_SECRET = "e2e-review-link-secret-value";

/** Inserts a processed source with `n` proposed cards for a user (what the pipeline would have stored). */
export async function seedProposedCards(userId: string, n: number, title = "Les abeilles") {
  const db = admin();
  const { data: cap } = await db.from("capture").insert({ user_id: userId, provider_message_id: `seed-${Date.now()}-${Math.random()}`, from_address: "seed@example.test", status: "done", raw: {} }).select("id").single();
  const { data: src } = await db.from("source").insert({ user_id: userId, capture_id: cap!.id, kind: "user_note", title, language: "fr", extracted_text: "Les abeilles dansent pour indiquer la direction du nectar.", content_hash: "h", extractor: "seed", extractor_version: "1" }).select("id").single();
  const { data: page } = await db.from("page").insert({ user_id: userId, source_id: src!.id, title }).select("id").single();
  await db.from("page_version").insert({ page_id: page!.id, user_id: userId, version: 1, summary: ["Les abeilles dansent"] });
  const { data: claim } = await db.from("claim").insert({ user_id: userId, page_id: page!.id, text: "Les abeilles dansent pour indiquer la direction du nectar.", origin: "source" }).select("id").single();
  await db.from("citation").insert({ claim_id: claim!.id, source_id: src!.id, user_id: userId, excerpt: "dansent pour indiquer la direction du nectar" });
  const cards = Array.from({ length: n }, (_, i) => ({ user_id: userId, claim_id: claim!.id, source_id: src!.id, question: `Question ${i + 1} sur la danse ?`, answer: `Réponse ${i + 1}`, rank: i + 1 }));
  await db.from("card").insert(cards);
  return { sourceId: src!.id as string, pageId: page!.id as string };
}
