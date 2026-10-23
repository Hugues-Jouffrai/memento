import { createDbSink } from "@/ai/db-sink";
import { createGateway } from "@/ai/gateway";
import { createFakeProvider } from "@/ai/providers/fake";
import { handleInbound } from "@/server/inbound";
import type { PageFetcher } from "@/server/fetcher";
import type { Mailer, MailSource, OutboundMail, PipelineDeps, ReceivedMail } from "@/server/ports";
import { runWorker } from "@/server/worker";
import { localAdmin, receivedEvent, signedWebhook, WEBHOOK_SECRET } from "./support";

export const db = localAdmin();

export const SOURCE_TEXT =
  "Les abeilles communiquent la position des fleurs par une danse. La danse frétillante indique la direction et la distance du nectar.";
export const claimsReply = JSON.stringify({
  language: "fr",
  topic: "Danse des abeilles",
  summary: ["Les abeilles dansent pour communiquer", "La danse indique direction et distance"],
  claims: [
    { text: "Les abeilles communiquent la position des fleurs par une danse.", excerpt: "communiquent la position des fleurs par une danse" },
    { text: "La danse frétillante indique la direction et la distance du nectar.", excerpt: "La danse frétillante indique la direction et la distance du nectar" },
  ],
});
export const cardsReply = (n = 4) =>
  JSON.stringify({
    cards: Array.from({ length: n }, (_, i) => ({
      claim: (i % 2) + 1,
      question: `Comment les abeilles signalent-elles la ressource numéro ${i + 1} ?`,
      answer: `Par une danse de type ${i + 1}.`,
      rank: i + 1,
    })),
  });
/** Enrichment reply built from a claims reply: every claim is a quoted (origin source) one. */
export const asEnrich = (claims: string) => {
  const j = JSON.parse(claims) as { claims: { text: string; excerpt: string }[] };
  return JSON.stringify({ ...j, claims: j.claims.map((c) => ({ ...c, origin: "source" })) });
};
/** Routes the fake model by the prompt it receives: cards, enrichment (short personal note) or claims. */
export const byStage = (claims: string, cards: string, enrich = asEnrich(claims)) => (req: { prompt: string }) =>
  req.prompt.includes("write flashcards") ? cards : req.prompt.includes("short personal note") ? enrich : claims;

export function setup(opts: {
  mails?: Record<string, ReceivedMail>;
  replies: Parameters<typeof createFakeProvider>[0];
  pages?: PageFetcher["fetchPage"];
  /** Attachment bytes by attachment id. */
  blobs?: Record<string, { filename: string; contentType: string; data: Buffer }>;
}) {
  const saved: { path: string; size: number; contentType: string }[] = [];
  const provider = createFakeProvider(opts.replies);
  const sent: OutboundMail[] = [];
  const mailer: Mailer = { send: async (m) => (sent.push(m), { id: `out-${sent.length}` }) };
  const source: MailSource = {
    fetchReceived: async (id) => {
      const m = opts.mails?.[id];
      if (!m) throw new Error(`no mail ${id}`);
      return m;
    },
    fetchAttachment: async (_emailId, attachmentId) => {
      const b = opts.blobs?.[attachmentId];
      if (!b) throw new Error(`no attachment ${attachmentId}`);
      return b;
    },
  };
  const deps: PipelineDeps = {
    db,
    ai: createGateway({ provider, sink: createDbSink(db.from("ai_call")), sleep: async () => undefined }),
    source,
    mailer,
    files: { save: async (path, data, contentType) => void saved.push({ path, size: data.length, contentType }) },
    pages: { fetchPage: opts.pages ?? (async () => { throw new Error("no page fetcher in this test"); }) },
    appUrl: "https://app.test",
    now: () => new Date(),
  };
  return { deps, provider, sent, saved };
}

export async function deliver(user: { id: string; email: string; token: string }, emailId: string, from = user.email) {
  const { body, headers } = signedWebhook(receivedEvent({ emailId, from, token: user.token }));
  return handleInbound(body, headers, { db, webhookSecret: WEBHOOK_SECRET });
}

/** Runs the worker until idle, skipping retry back-off so tests do not wait minutes. */
export async function drain(deps: PipelineDeps, userId: string, rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await db.from("job").update({ run_after: new Date().toISOString() }).eq("user_id", userId).eq("status", "queued");
    const s = await runWorker(deps);
    if (s.claimed === 0) return;
  }
}

export const captureOf = async (userId: string, emailId: string) =>
  (await db.from("capture").select("*").eq("user_id", userId).eq("provider_message_id", emailId).single()).data!;

export const mail = (text = SOURCE_TEXT, subject = "Les abeilles"): ReceivedMail => ({ subject, text, html: null, messageId: null });

