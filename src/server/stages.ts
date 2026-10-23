import { createHash, randomUUID } from "node:crypto";
import { authDecision, type CaptureRoute } from "@/domain/capture";
import { firstCardRequest, requestPromptVars } from "@/domain/card-request";
import { cardCap, cardShortfall, validateCards, type CardShortfall } from "@/domain/cards";
import { isGrounded } from "@/domain/excerpt";
import { extractUrls, normalizeUrl, stripUrls } from "@/domain/links";
import { cleanSubject, parseMail } from "@/domain/mail";
import { MAX_ATTACHMENT_BYTES, MAX_VISION_BYTES, hasUsableTextLayer } from "@/domain/attachments";
import { planItems, type MailItem } from "@/domain/items";
import { MAX_CLAIMS_PER_PAGE, NEW_PAGE, acceptableClaims, applyOps, type Op, type PageState } from "@/domain/kb";
import { mergeSummary } from "@/domain/matching";
import { classifyPage } from "@/domain/paywall";
import { CardsOutput, ClaimsOutput, EnrichOutput, TranscribeOutput } from "@/ai/schemas";
import { PageError } from "./fetcher";
import { readPdfText } from "./pdf";
import { originalPath } from "./storage";
import { buildDoneReceipt, buildDuplicateReceipt, buildFailedReceipt, buildGroupReceipt, type GroupItem, type Lang } from "./emails";
import { sendEmailOnce } from "./outbox";
import { PermanentError, type FailureReason, type OutboundMail, type PipelineDeps } from "./ports";
import { reminderStage } from "./reminders";
import { proposeLinks } from "./links";
import { recordShadowRevisions } from "./revisions";
import { planPage, storePageEmbedding } from "./topics";

export interface JobRow {
  id: string;
  user_id: string;
  capture_id: string | null;
  stage: string;
  payload: Record<string, unknown>;
  /** Set by claim_jobs (this claim included). */
  attempts?: number;
  max_attempts?: number;
}

interface CaptureRow {
  id: string;
  user_id: string;
  provider_message_id: string;
  from_address: string;
  /** Set on the extra sources of a mail with several links or files; the mail's own capture is the parent. */
  parent_id: string | null;
  subject: string | null;
  status: string;
  /** Which address the mail came through (D50). */
  route: string;
  raw: { data?: { email_id?: string } };
  body_text: string | null;
  body_html: string | null;
  page: PageSnapshot | null;
  notes: CaptureNotes;
  position: number;
}

/** The fetched page of a link, kept before it becomes a source (R-PIPE-02). */
export interface PageSnapshot {
  url: string;
  finalUrl: string;
  title: string | null;
  text: string;
  status: number;
  fetchedAt: string;
}

/** Facts the receipt has to mention. */
export interface CaptureNotes {
  /** The link that was read, and the ones beyond the per-mail cap that were not. */
  url?: string;
  ignoredUrls?: string[];
  /** The attachment that is the source (PDF or image), and the files that were not read. */
  file?: { id: string; filename: string; contentType: string; size: number; kind: "pdf" | "image" };
  ignoredFiles?: string[];
  /** Why the capture failed, for the combined receipt of a mail with several sources. */
  failReason?: FailureReason;
  /** Where the original file is kept, how its text was obtained, and its hash (dedup). */
  blobPath?: string;
  fileExtractor?: "pdf-text" | "vision";
  fileHash?: string;
  /** The source was longer than what the model read (R-PIPE-06). */
  truncated?: { used: number; total: number };
  /** The number of cards the user asked for in their own words (D64, R-CAP-14), clamped to 1..30. */
  requestedCards?: number;
  /** Set when fewer cards were made than asked: counts only, no text (R-CARD-10). */
  cards?: CardShortfall;
}

export const MAX_SOURCE_CHARS = 30_000;
/** Below this many characters there is nothing to learn from; sparse-note enrichment arrives in M2. */
export const MIN_SOURCE_CHARS = 12;
/** Dedup is only trusted for texts at least this long. */
export const DEDUP_MIN_CHARS = 40;
/** A personal note shorter than this is sparse: it is enriched from the model's knowledge (R-PIPE-05). */
export const SPARSE_NOTE_CHARS = 1500;
/** Whether sparse-note enrichment gets the critical-editor pass (decided from the eval, D35). */
export const REFINE_ENRICHMENT = false;
/** A claim that starts like a sentence about the user ("J'ai lu...", "I read...") is not a fact about the subject. */
const FIRST_PERSON = /^(j['’]ai|je |i |i['’]ve|i have|nous |we )/i;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function captureIdOf(job: JobRow): string {
  if (!job.capture_id) throw new Error(`job ${job.id} has no capture`);
  return job.capture_id;
}

const CAPTURE_COLUMNS = "id,user_id,provider_message_id,from_address,parent_id,position,subject,status,route,raw,body_text,body_html,page,notes";

async function loadCapture(deps: PipelineDeps, id: string): Promise<CaptureRow> {
  const { data, error } = await deps.db.from("capture").select(CAPTURE_COLUMNS).eq("id", id).single();
  if (error || !data) throw new Error(`capture ${id} not found`);
  return data as CaptureRow;
}

async function enqueue(deps: PipelineDeps, job: JobRow, stage: string) {
  const { error } = await deps.db.rpc("enqueue_job", {
    p_user_id: job.user_id,
    p_capture_id: captureIdOf(job),
    p_stage: stage,
    p_key: `capture:${captureIdOf(job)}:${stage}`,
  });
  if (error) throw new Error(`enqueue ${stage}: ${error.message}`);
}

/** R-CAP-06: exactly one receipt per capture (per mail, when the mail has several sources: the root capture's key). */
export function sendReceiptOnce(
  deps: PipelineDeps,
  userId: string,
  captureId: string,
  build: (lang: Lang) => Omit<OutboundMail, "to">,
): Promise<void> {
  return sendEmailOnce(deps, { userId, kind: "receipt", dedupKey: `capture:${captureId}`, build });
}

type Terminal = "done" | "failed" | "duplicate";
const isTerminal = (status: string) => status === "done" || status === "failed" || status === "duplicate";

/** The captures of one mail: its own (position 0) and one per further link or file. */
async function mailGroup(deps: PipelineDeps, cap: Pick<CaptureRow, "id" | "parent_id">): Promise<{ rootId: string; members: CaptureRow[] }> {
  const rootId = cap.parent_id ?? cap.id;
  const { data, error } = await deps.db.from("capture").select(CAPTURE_COLUMNS).or(`id.eq.${rootId},parent_id.eq.${rootId}`).order("position");
  if (error || !data?.length) throw new Error(`capture group ${rootId} not found`);
  return { rootId, members: data as unknown as CaptureRow[] };
}

/** What a mail's member is called in the combined receipt. */
function memberLabel(m: CaptureRow): string {
  return m.notes.file?.filename ?? m.notes.url ?? cleanSubject(m.subject);
}

/**
 * Once every capture of a mail is finished, sends the one combined receipt (M3 step 0). A no-op while any member is
 * still running; safe to call twice (the receipt is keyed by the root capture).
 */
async function sendGroupReceiptIfComplete(deps: PipelineDeps, cap: Pick<CaptureRow, "id" | "parent_id">): Promise<void> {
  const { rootId, members } = await mailGroup(deps, cap);
  if (members.length < 2 || !members.every((m) => isTerminal(m.status))) return;
  // D59: a mail whose sources all went through sends nothing; the "Mails reçus" list shows it.
  if (!members.some((m) => m.status === "failed")) return;
  const root = members.find((m) => m.id === rootId)!;
  const items: GroupItem[] = [];
  for (const m of members) {
    const title = memberLabel(m);
    if (m.status === "duplicate") items.push({ outcome: "duplicate", title });
    else if (m.status === "failed") items.push({ outcome: "failed", title, reason: m.notes.failReason ?? "unknown" });
    else {
      const { data: source } = await deps.db.from("source").select("id,title").eq("capture_id", m.id).single();
      const { data: link } = await deps.db.from("source_page").select("page:page(title)").eq("source_id", source!.id).single();
      const page = link!.page as unknown as { title: string };
      const { data: cards } = await deps.db.from("card").select("question").eq("source_id", source!.id).order("rank");
      items.push({ outcome: "done", title: (source!.title as string | null) || title, pageTitle: page.title, cardQuestions: (cards ?? []).map((c) => c.question as string) });
    }
  }
  await sendReceiptOnce(deps, root.user_id, rootId, (lang) =>
    buildGroupReceipt(lang, {
      title: cleanSubject(root.subject),
      items,
      trayUrl: `${deps.appUrl}/tray`,
      ignoredUrls: root.notes.ignoredUrls ?? [],
      ignoredFiles: root.notes.ignoredFiles ?? [],
      truncated: members.some((m) => Boolean(m.notes.truncated)),
    }),
  );
}

/**
 * Ends a capture and sends the receipt. A mail with one source gets its own receipt, as always; a mail with several
 * gets one combined receipt when its last member ends, so `single` is only used in the first case.
 */
async function conclude(
  deps: PipelineDeps,
  cap: CaptureRow,
  status: Terminal,
  patch: { error?: string; notes?: CaptureNotes },
  single: (lang: Lang) => Omit<OutboundMail, "to">,
): Promise<void> {
  const { members } = await mailGroup(deps, cap);
  const mark = () =>
    deps.db.from("capture").update({ status, ...patch, updated_at: deps.now().toISOString() }).eq("id", cap.id);
  if (members.length === 1) {
    await mark();
    // D59: only a failure is mailed (R-CAP-06); done and duplicate show in the "Mails reçus" list.
    if (status === "failed") await sendReceiptOnce(deps, cap.user_id, cap.id, single);
    return;
  }
  await mark();
  await sendGroupReceiptIfComplete(deps, cap);
}

/** Ends a capture in `failed` and sends the failure receipt (R-PIPE-01). */
export async function failCapture(deps: PipelineDeps, captureId: string, reason: FailureReason, detail?: string): Promise<void> {
  const cap = await loadCapture(deps, captureId);
  if (isTerminal(cap.status)) return;
  await conclude(deps, cap, "failed", { error: (detail ?? reason).slice(0, 500), notes: { ...cap.notes, failReason: reason } }, (lang) =>
    buildFailedReceipt(lang, { title: cleanSubject(cap.subject), reason }),
  );
}

/** Creates one capture per further link or file of the mail (idempotent) and starts each one's own pipeline. */
async function spawnMembers(deps: PipelineDeps, cap: CaptureRow, mail: { subject: string | null; text: string | null; html: string | null }, items: MailItem[]): Promise<void> {
  if (!items.length) return;
  const rows = items.map((it, i) => ({
    user_id: cap.user_id,
    parent_id: cap.id,
    position: i + 1,
    provider_message_id: `${cap.provider_message_id}#${i + 1}`,
    from_address: cap.from_address,
    subject: mail.subject ?? cap.subject,
    status: "received",
    route: cap.route,
    raw: cap.raw,
    body_text: mail.text,
    body_html: mail.html,
    notes: it.kind === "file" ? { file: { ...it.file } } : { url: it.url },
  }));
  const { error } = await deps.db.from("capture").upsert(rows, { onConflict: "user_id,provider_message_id", ignoreDuplicates: true });
  if (error) throw new Error(`spawn members: ${error.message}`);
  const { data: kids } = await deps.db.from("capture").select("id,notes").eq("parent_id", cap.id).order("position");
  for (const kid of kids ?? []) {
    const stage = (kid.notes as CaptureNotes).file ? "file" : "page";
    const { error: e } = await deps.db.rpc("enqueue_job", { p_user_id: cap.user_id, p_capture_id: kid.id, p_stage: stage, p_key: `capture:${kid.id}:${stage}` });
    if (e) throw new Error(`enqueue ${stage}: ${e.message}`);
  }
}

/** Stage 1: read the body from the provider, plan what it contains (files, links), dedup, move on. */
async function fetchStage(deps: PipelineDeps, job: JobRow): Promise<void> {
  const cap = await loadCapture(deps, captureIdOf(job));
  if (isTerminal(cap.status) || cap.status === "rejected") return;
  const emailId = cap.raw.data?.email_id;
  if (!emailId) throw new PermanentError("fetch_error");
  const mail = await deps.source.fetchReceived(emailId);

  // R-CAP-03 / R-CAP-12 (D50): the DKIM rule runs here, before anything else can reach the AI.
  const route: CaptureRoute = cap.route === "shared" ? "shared" : "token";
  const authentication = mail.authentication ?? null;
  let decision = authDecision(route, authentication);
  if (decision === "wait") {
    // Resend has not finished its checks: retry through the queue's back-off; on the last attempt, refuse.
    if ((job.attempts ?? 1) < (job.max_attempts ?? 1)) throw new Error("dkim result still processing");
    decision = "reject";
  }
  const auth = {
    spf: authentication?.spf ?? null,
    dkim: authentication?.dkim ?? null,
    dmarc: authentication?.dmarc ?? null,
    route,
    decision,
    checked_at: deps.now().toISOString(),
  };
  if (decision === "reject") {
    // No receipt: answering unauthenticated mail would be backscatter, and the account owner did not send it.
    const reason = `dkim_${auth.dkim ?? "missing"}`;
    await deps.db.from("capture").update({ status: "rejected", auth, error: reason, updated_at: deps.now().toISOString() }).eq("id", cap.id);
    console.info(JSON.stringify({ event: "capture_rejected", capture_id: cap.id, route, reason }));
    return;
  }
  await deps.db.from("capture").update({ auth }).eq("id", cap.id);

  const parsed = parseMail({ subject: mail.subject ?? cap.subject, text: mail.text, html: mail.html });
  const hash = sha256(parsed.dedupText.toLowerCase().replace(/\s+/g, " ").trim());

  await deps.db
    .from("capture")
    .update({
      body_text: mail.text,
      body_html: mail.html,
      subject: mail.subject ?? cap.subject,
      content_hash: hash,
      status: "processing",
      updated_at: deps.now().toISOString(),
    })
    .eq("id", cap.id);

  // R-CAP-07: every usable attachment and every link of a personal note is a source. The first is this capture's own;
  // the others become captures of their own (M3 step 0), so each keeps the whole single-source pipeline.
  const urls = parsed.sourceKind === "user_note" ? extractUrls(parsed.dedupText) : [];
  const plan = planItems(mail.attachments ?? [], urls);
  const [first, ...rest] = plan.items;
  const ignored = { ignoredFiles: plan.ignoredFiles, ignoredUrls: plan.ignoredUrls };

  if (!first) {
    if (plan.ignoredFiles.length && parsed.sourceText.length < MIN_SOURCE_CHARS) throw new PermanentError("unsupported_file");
    // R-PIPE-03: the same content already captured and processed is not processed again.
    if (await dedupByContent(deps, cap, hash, parsed)) return;
    if (plan.ignoredFiles.length) await deps.db.from("capture").update({ notes: { ignoredFiles: plan.ignoredFiles } }).eq("id", cap.id);
    await enqueue(deps, job, "extract");
    return;
  }

  await spawnMembers(deps, cap, { subject: mail.subject, text: mail.text, html: mail.html }, rest);
  if (first.kind === "file") {
    const notes: CaptureNotes = { file: { ...first.file }, ...ignored };
    await deps.db.from("capture").update({ notes }).eq("id", cap.id);
    await enqueue(deps, job, "file");
    return;
  }
  if (await dedupByContent(deps, cap, hash, parsed)) return;
  const notes: CaptureNotes = { url: first.url, ...ignored };
  await deps.db.from("capture").update({ notes }).eq("id", cap.id);
  await enqueue(deps, job, "page");
}

/** The same mail text already captured and processed: this capture ends as a duplicate. */
async function dedupByContent(deps: PipelineDeps, cap: CaptureRow, hash: string, parsed: ReturnType<typeof parseMail>): Promise<boolean> {
  if (parsed.sourceText.length < DEDUP_MIN_CHARS) return false;
  const { data: twin } = await deps.db
    .from("capture")
    .select("id")
    .eq("user_id", cap.user_id)
    .eq("content_hash", hash)
    .eq("status", "done")
    .neq("id", cap.id)
    .limit(1);
  if (!twin?.length) return false;
  await conclude(deps, cap, "duplicate", {}, (lang) => buildDuplicateReceipt(lang, { title: parsed.title }));
  return true;
}


/** Vision: the model reads a scanned PDF or an image and returns its text (or a description of the picture). */
export async function transcribeFile(
  ai: PipelineDeps["ai"],
  userId: string | null,
  file: { mimeType: string; data: Buffer },
  note: string,
): Promise<TranscribeOutput> {
  const { data } = await ai.run({ stage: "transcribe", userId, vars: { note }, schema: TranscribeOutput, files: [file] });
  return data;
}

/**
 * Stage 1c: read an attachment. A PDF with a text layer is read locally (free, exact); a scanned PDF or an image goes
 * to the vision model (stage `transcribe`). The original is kept in private storage and the text becomes the snapshot.
 */
async function fileStage(deps: PipelineDeps, job: JobRow): Promise<void> {
  const cap = await loadCapture(deps, captureIdOf(job));
  if (isTerminal(cap.status)) return;
  const file = cap.notes.file;
  const emailId = cap.raw.data?.email_id;
  if (!file || !emailId) throw new Error("file stage without a file");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new PermanentError("file_too_large");
  if (!cap.page) {
    const got = await deps.source.fetchAttachment(emailId, file.id, MAX_ATTACHMENT_BYTES);
    const fileHash = createHash("sha256").update(got.data).digest("hex");
    // R-PIPE-03: the same file sent twice is not processed twice.
    const { data: twin } = await deps.db.from("source").select("id").eq("user_id", cap.user_id).eq("kind", "file").eq("content_hash", fileHash).limit(1);
    if (twin?.length) {
      await conclude(deps, cap, "duplicate", {}, (lang) => buildDuplicateReceipt(lang, { title: file.filename }));
      return;
    }
    const blobPath = originalPath(cap.user_id, cap.id, got.filename);
    await deps.files.save(blobPath, got.data, got.contentType);

    const mimeType = file.kind === "pdf" ? "application/pdf" : got.contentType.split(";")[0]!.trim();
    let text = "";
    let title: string | null = null;
    let fileExtractor: "pdf-text" | "vision" = "vision";
    if (file.kind === "pdf") {
      const layer = await readPdfText(got.data).catch(() => null);
      if (layer && hasUsableTextLayer(layer.text, layer.pages)) {
        text = layer.text;
        fileExtractor = "pdf-text";
      }
    }
    if (fileExtractor === "vision") {
      // A scan or an image: the vision model reads it. Inline requests are limited in size.
      if (got.data.length > MAX_VISION_BYTES) throw new PermanentError("file_too_large");
      const out = await transcribeFile(deps.ai, cap.user_id, { mimeType, data: got.data }, stripUrls(parseMail({ subject: cap.subject, text: cap.body_text, html: cap.body_html }).dedupText));
      text = out.text.trim();
      title = out.title;
    }
    if (text.length < MIN_SOURCE_CHARS) throw new PermanentError("unreadable_file");
    const snapshot: PageSnapshot = {
      url: got.filename,
      finalUrl: `file:${got.filename}`,
      title: title ?? got.filename.replace(/\.[A-Za-z0-9]+$/, ""),
      text,
      status: 200,
      fetchedAt: deps.now().toISOString(),
    };
    await deps.db
      .from("capture")
      .update({ page: snapshot, notes: { ...cap.notes, blobPath, fileExtractor, fileHash }, updated_at: deps.now().toISOString() })
      .eq("id", cap.id);
  }
  await enqueue(deps, job, "extract");
}

/** Stage 1b: fetch the linked page (SSRF-safe), keep the snapshot, refuse paywalled or empty pages with a clear receipt. */
async function pageStage(deps: PipelineDeps, job: JobRow): Promise<void> {
  const cap = await loadCapture(deps, captureIdOf(job));
  if (isTerminal(cap.status)) return;
  const url = cap.notes.url;
  if (!url) throw new Error("page stage without a url");
  if (!cap.page) {
    // R-PIPE-03: the same page (same URL after normalisation) is not read twice.
    const { data: sameUrl } = await deps.db.from("source").select("id").eq("user_id", cap.user_id).eq("url", normalizeUrl(url) ?? url).limit(1);
    if (sameUrl?.length) {
      await conclude(deps, cap, "duplicate", {}, (lang) => buildDuplicateReceipt(lang, { title: parseMail({ subject: cap.subject, text: cap.body_text, html: cap.body_html }).title || url }));
      return;
    }
    let fetched;
    try {
      fetched = await deps.pages.fetchPage(url);
    } catch (err) {
      if (err instanceof PageError) {
        if (err.kind === "blocked") throw new PermanentError("url_blocked");
        if (err.kind === "unsupported_type") throw new PermanentError("unsupported_link");
        // A 4xx other than a login wall will not change on retry; timeouts, 5xx and network errors may.
        if (err.kind === "http_error" && (err.status ?? 500) < 500) throw new PermanentError("page_error");
      }
      throw err;
    }
    const verdict = classifyPage(fetched);
    if (verdict === "paywall") throw new PermanentError("paywall");
    if (verdict === "empty") throw new PermanentError("empty_page");
    const snapshot: PageSnapshot = {
      url: fetched.url,
      finalUrl: fetched.finalUrl,
      title: fetched.title,
      text: fetched.text,
      status: fetched.status,
      fetchedAt: fetched.fetchedAt,
    };
    await deps.db.from("capture").update({ page: snapshot, updated_at: deps.now().toISOString() }).eq("id", cap.id);
  }
  await enqueue(deps, job, "extract");
}

/** Overrides for experiments and evals; production uses the configured model and the latest prompt. */
export interface StageOptions {
  model?: string;
  promptVersion?: string;
  /** The number of cards the user asked for (D64); absent when they gave none. */
  requested?: number | null;
  /** Run the critical-editor pass over the draft claims (stage `refine`). Default: the pipeline's setting. */
  refine?: boolean;
}

export interface Extracted {
  language: string;
  topic: string;
  summary: string[];
  claims: { text: string; origin: "source" | "model"; excerpt?: string }[];
  /** Questions the source raises but does not answer (claims/v4); empty for an enriched note. */
  questions?: string[];
}

/** Rich source: claims quoted from the source. R-KB-05: a claim whose excerpt is not in the source is dropped. */
export async function extractClaims(deps: PipelineDeps, userId: string, text: string, instruction: string, requested?: number | null): Promise<Extracted> {
  const { data: out } = await deps.ai.run({ stage: "claims", userId, vars: { text, instruction, ...requestPromptVars(requested) }, schema: ClaimsOutput });
  const grounded = out.claims.filter((c) => isGrounded(c.excerpt, text));
  if (!grounded.length) throw new PermanentError("no_claims");
  const { open_questions: questions, ...rest } = out;
  return { ...rest, questions, claims: grounded.map((c) => ({ text: c.text, origin: "source" as const, excerpt: c.excerpt })) };
}

/**
 * Sparse note (R-PIPE-05): the model writes the key facts about the note's subject from its own knowledge.
 * Facts it attributes to the note must be quoted from it (otherwise they are dropped); everything else is
 * stored with origin `model` so the UI can badge it.
 */
export async function enrichNote(deps: PipelineDeps, userId: string | null, text: string, opts: StageOptions = {}): Promise<Extracted> {
  const { refine = REFINE_ENRICHMENT, requested, ...aiOpts } = opts;
  let { data: out } = await deps.ai.run({ stage: "enrich", userId, vars: { text, ...requestPromptVars(requested) }, schema: EnrichOutput, ...aiOpts });
  if (refine) {
    // A critical editor reviews the draft: vague claims are made concrete or dropped, missing key facts are added.
    const draft = JSON.stringify({ language: out.language, topic: out.topic, summary: out.summary, claims: out.claims }, null, 1);
    const reviewed = await deps.ai.run({ stage: "refine", userId, vars: { text, draft }, schema: EnrichOutput, model: aiOpts.model });
    out = reviewed.data;
  }
  const claims = out.claims.flatMap((c): Extracted["claims"] => {
    if (c.origin === "model") return [{ text: c.text, origin: "model" }];
    // A quote that is (nearly) the whole note is the note restated, not a fact from it; so is a first-person sentence.
    const restatesNote = (c.excerpt?.length ?? 0) > 0.8 * text.length || FIRST_PERSON.test(c.text.trim());
    return c.excerpt && !restatesNote && isGrounded(c.excerpt, text) ? [{ text: c.text, origin: "source", excerpt: c.excerpt }] : [];
  });
  if (!claims.length) throw new PermanentError("no_claims");
  return { ...out, claims };
}

/** Pages already linked to `pageId`, active or removed: the link stage does not ask about them again (R-KB-13). */
async function linkedPageIds(deps: PipelineDeps, pageId: string): Promise<Set<string>> {
  const { data } = await deps.db.from("page_link").select("page_a,page_b").or(`page_a.eq.${pageId},page_b.eq.${pageId}`);
  return new Set(((data ?? []) as { page_a: string; page_b: string }[]).map((l) => (l.page_a === pageId ? l.page_b : l.page_a)));
}

/**
 * Open questions the source raises (D66, R-KB-14) as `add_open_question` operations. Each goes through `applyOps` on a
 * scratch page holding the target's open questions, so a repeat or a page already at its cap of 3 simply drops the
 * question: it never fails the source.
 */
async function questionOps(deps: PipelineDeps, target: PageState | null, pageRef: string, texts: readonly string[]): Promise<Op[]> {
  const wanted = texts.map((t) => t.trim()).filter((t) => t.endsWith("?"));
  if (!wanted.length) return [];
  const { data } = target ? await deps.db.from("open_question").select("id,text").eq("page_id", target.id).eq("status", "open") : { data: [] };
  const questions = ((data ?? []) as { id: string; text: string }[]).map((q) => ({ id: q.id, text: q.text, status: "open" as const }));
  let state = { pages: { scratch: { id: "scratch", title: "", summary: [], claims: [], questions } }, cards: [] };
  const ops: Op[] = [];
  for (const text of wanted) {
    const checked = applyOps(state, [{ op: "add_open_question", page: "scratch", text }], { sourceText: "", newPageId: "" });
    if (!checked.ok) continue;
    state = checked.state as typeof state;
    ops.push({ op: "add_open_question", page: pageRef, text });
  }
  return ops;
}

/** Stage 2: claims with grounded excerpts, then source + page + claims + citations in one transaction. */
async function extractStage(deps: PipelineDeps, job: JobRow): Promise<void> {
  const cap = await loadCapture(deps, captureIdOf(job));
  if (cap.status === "done" || cap.status === "failed" || cap.status === "duplicate") return;
  const parsed = parseMail({ subject: cap.subject, text: cap.body_text, html: cap.body_html });
  const snapshot = cap.page;
  // With a fetched page, the page is the source and the user's own words (minus the URL) are the instruction.
  const sourceKind = snapshot ? (cap.notes.file ? "file" : "url") : parsed.sourceKind;
  const fullText = snapshot ? snapshot.text : parsed.sourceText;
  if (fullText.length < MIN_SOURCE_CHARS) throw new PermanentError("too_short");
  const text = fullText.slice(0, MAX_SOURCE_CHARS);
  const instruction = snapshot ? stripUrls(parsed.dedupText) : parsed.instruction;

  // A short personal note, or a photo with little text, is enriched from the model's knowledge (R-PIPE-05).
  const sparse = (sourceKind === "user_note" || (sourceKind === "file" && cap.notes.file?.kind === "image")) && text.length < SPARSE_NOTE_CHARS;
  // D64, R-CAP-14: a number of cards in the user's own words (the note, then the instruction) is honoured.
  const requested = firstCardRequest(stripUrls(parsed.note), instruction);
  const notes: CaptureNotes = { ...cap.notes };
  if (requested !== null) notes.requestedCards = requested;
  else delete notes.requestedCards;
  if (fullText.length > MAX_SOURCE_CHARS) {
    // R-PIPE-06: a long source is read from the start; the receipt says so.
    notes.truncated = { used: MAX_SOURCE_CHARS, total: fullText.length };
  }
  if (requested !== null || notes.truncated || cap.notes.requestedCards !== undefined) {
    await deps.db.from("capture").update({ notes }).eq("id", cap.id);
  }
  const extracted = sparse
    ? await enrichNote(deps, cap.user_id, text, { requested })
    : await extractClaims(deps, cap.user_id, text, instruction, requested);

  // R-KB-02: the source joins an existing topic page when the model says it is the same subject, else it gets its own.
  const plan = await planPage(deps, cap.user_id, cap.id, extracted);
  let target: PageState | null = null;
  if (plan.page) {
    const { data: existing } = await deps.db.from("claim").select("id,text,origin").eq("page_id", plan.page.id).order("created_at").order("id");
    // A page at its size limit takes no more claims: the source gets a page of its own (a split is proposed in step 4).
    if ((existing?.length ?? 0) < MAX_CLAIMS_PER_PAGE) {
      target = { id: plan.page.id, title: plan.page.title, summary: plan.page.summary, claims: (existing ?? []) as PageState["claims"] };
    }
  }
  // R-KB-03: the update is a batch of validated operations, never a rewritten page.
  const { accepted } = acceptableClaims(target ?? { id: "new", title: extracted.topic, summary: [], claims: [] }, extracted.claims, text);
  if (!target && !accepted.length) throw new PermanentError("no_claims");
  const summary = target ? mergeSummary(target.summary, extracted.summary) : extracted.summary;
  const pageRef = target ? target.id : NEW_PAGE;
  const baseOps: Op[] = [
    target ? { op: "set_summary", page: target.id, summary } : { op: "create_page", title: extracted.topic, language: extracted.language, summary },
    ...accepted.map((c): Op => ({ op: "add_claim", page: pageRef, text: c.text, origin: c.origin, ...(c.origin === "source" ? { excerpt: c.excerpt } : {}) })),
  ];
  const checked = applyOps({ pages: target ? { [target.id]: target } : {}, cards: [] }, baseOps, { sourceText: text, newPageId: randomUUID() });
  if (!checked.ok) throw new Error(`invalid knowledge-base update: ${checked.errors.join("; ")}`);
  // D66, R-KB-12: pages related to this source's page. Already validated by the link stage; empty while in shadow mode.
  const linkOps = await proposeLinks(deps, {
    userId: cap.user_id,
    captureId: cap.id,
    source: { topic: target ? target.title : extracted.topic, summary },
    candidates: plan.candidates.filter((c) => c.id !== target?.id),
    pageRef,
    linkedPageIds: target ? await linkedPageIds(deps, target.id) : undefined,
  });
  const ops: Op[] = [...baseOps, ...linkOps, ...(await questionOps(deps, target, pageRef, extracted.questions ?? []))];

  const { data: sourceId, error } = await deps.db.rpc("apply_ops", {
    p_capture_id: cap.id,
    p_source: {
      kind: sourceKind,
      title: (snapshot ? snapshot.title : null) || parsed.title || null,
      url: snapshot && !cap.notes.file ? normalizeUrl(snapshot.url) : null,
      blob_path: cap.notes.blobPath ?? null,
      language: extracted.language,
      text: fullText,
      hash: cap.notes.fileHash ?? sha256(fullText),
      extractor: cap.notes.file ? (cap.notes.fileExtractor === "pdf-text" ? "pdf-text-v1" : "vision-v1") : snapshot ? "page-v1" : "mail-v1",
      extractor_version: "1",
    },
    p_ops: ops,
  });
  if (error) throw new Error(`apply_ops: ${error.message}`);
  const { data: link } = await deps.db.from("source_page").select("page_id,page:page(title)").eq("source_id", sourceId as string).single();
  if (link) {
    const title = (link.page as unknown as { title: string }).title;
    await storePageEmbedding(deps, cap.user_id, link.page_id as string, target ? null : plan.vector, target ? null : plan.model, title, summary);
  }
  // Shadow mode (D44, R-KB-06): compare the new claims with the page's earlier ones and log what a revision would do.
  if (target?.claims.length && accepted.length) await recordShadowRevisions(deps, { userId: cap.user_id, captureId: cap.id, page: target, incoming: accepted });
  await enqueue(deps, job, "cards");
}

/** Asks the model for cards over numbered claims, then validates and caps them (R-CARD-03, R-CARD-04). */
export async function proposeCards(
  ai: PipelineDeps["ai"],
  userId: string | null,
  claimTexts: readonly string[],
  opts: StageOptions = {},
): Promise<ReturnType<typeof validateCards> & { invalidClaim: number; shortfall: CardShortfall | null }> {
  const { requested, ...aiOpts } = opts;
  const { data: out } = await ai.run({
    stage: "cards",
    userId,
    vars: { claims: claimTexts.map((t, i) => `${i + 1}. ${t}`).join("\n"), ...requestPromptVars(requested) },
    schema: CardsOutput,
    ...aiOpts,
  });
  const inRange = out.cards.filter((c) => c.claim >= 1 && c.claim <= claimTexts.length);
  const candidates = inRange.map((c) => ({ claimIndex: c.claim - 1, question: c.question, answer: c.answer, rank: c.rank }));
  const validated = validateCards(candidates, cardCap(requested));
  const invalidClaim = out.cards.length - inRange.length;
  return { ...validated, invalidClaim, shortfall: cardShortfall(requested, validated.accepted.length, validated.rejected, invalidClaim) };
}

/** Stage 3: propose cards from the stored claims, validated and capped. */
async function cardsStage(deps: PipelineDeps, job: JobRow): Promise<void> {
  const cap = await loadCapture(deps, captureIdOf(job));
  if (cap.status === "done" || cap.status === "failed" || cap.status === "duplicate") return;
  const { data: source } = await deps.db.from("source").select("id").eq("capture_id", cap.id).single();
  if (!source) throw new Error("source missing for cards stage");
  // Only the claims this source added: when it extended a page, the page's older claims already have their cards.
  const { data: claims } = await deps.db.from("claim").select("id,text").eq("capture_id", cap.id).order("created_at").order("id");
  if (!claims?.length) {
    // A source that only repeats what its page already says adds no claims and no cards; the receipt tells the user.
    await enqueue(deps, job, "receipt");
    return;
  }

  const requested = cap.notes.requestedCards ?? null;
  const { accepted, shortfall } = await proposeCards(deps.ai, cap.user_id, claims.map((c) => c.text as string), { requested });

  const { data: stored, error } = await deps.db.rpc("store_cards", {
    p_source_id: source.id,
    p_cards: accepted.map((c, i) => ({
      claim_id: claims[c.claimIndex]!.id,
      question: c.question.trim(),
      answer: c.answer.trim(),
      rank: i + 1,
    })),
  });
  if (error) throw new Error(`store_cards: ${error.message}`);
  if (shortfall && !(stored === 0 && accepted.length > 0)) {
    // R-CARD-10: fewer cards than asked. Counts only, never text; shown in the "Mails reçus" list and logged.
    await deps.db.from("capture").update({ notes: { ...cap.notes, cards: shortfall } }).eq("id", cap.id);
    console.info(JSON.stringify({ event: "cards_shortfall", capture_id: cap.id, ...shortfall }));
  }
  await enqueue(deps, job, "receipt");
}

/** Stage 4: the success receipt, then the capture is done. */
async function receiptStage(deps: PipelineDeps, job: JobRow): Promise<void> {
  const cap = await loadCapture(deps, captureIdOf(job));
  if (isTerminal(cap.status)) {
    // A retry after the capture ended: the combined receipt of its mail may still be owed (it is sent once).
    await sendGroupReceiptIfComplete(deps, cap);
    return;
  }
  const { data: source } = await deps.db.from("source").select("id,title").eq("capture_id", cap.id).single();
  const { data: link } = await deps.db.from("source_page").select("page:page(id,title,source_id)").eq("source_id", source!.id).single();
  const page = link!.page as unknown as { id: string; title: string; source_id: string };
  const { data: version } = await deps.db.from("page_version").select("summary").eq("page_id", page.id).order("version", { ascending: false }).limit(1).single();
  const { data: cards } = await deps.db.from("card").select("question").eq("source_id", source!.id).order("rank");

  await conclude(deps, cap, "done", {}, (lang) =>
    buildDoneReceipt(lang, {
      title: (source!.title as string | null) ?? "",
      pageTitle: page.title,
      pageUpdated: page.source_id !== source!.id,
      summary: (version?.summary as string[]) ?? [],
      cardQuestions: (cards ?? []).map((c) => c.question as string),
      trayUrl: `${deps.appUrl}/tray`,
      ignoredUrls: cap.notes.ignoredUrls ?? [],
      ignoredFiles: cap.notes.ignoredFiles ?? [],
      truncated: Boolean(cap.notes.truncated),
    }),
  );
}

const STAGES: Record<string, (deps: PipelineDeps, job: JobRow) => Promise<void>> = {
  fetch: fetchStage,
  page: pageStage,
  file: fileStage,
  extract: extractStage,
  cards: cardsStage,
  receipt: receiptStage,
  reminder: reminderStage,
};

export async function runStage(deps: PipelineDeps, job: JobRow): Promise<void> {
  const stage = STAGES[job.stage];
  if (!stage) throw new PermanentError("unknown");
  await stage(deps, job);
}
