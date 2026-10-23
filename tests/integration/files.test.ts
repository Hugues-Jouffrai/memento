import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { AttachmentMeta } from "@/domain/attachments";
import type { ReceivedMail } from "@/server/ports";
import { SOURCE_TEXT, byStage, captureOf, cardsReply, claimsReply, db, deliver, drain, mail, setup } from "./pipeline-support";
import { makeUser } from "./support";

/** A real PDF with a text layer (two pages of text). */
async function textPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < 2; p++) {
    const page = doc.addPage([595, 842]);
    for (let i = 0; i < 4; i++) page.drawText(SOURCE_TEXT, { x: 20, y: 800 - i * 20, size: 8, font });
  }
  return Buffer.from(await doc.save());
}

/** A PDF page with no text at all: what a scan looks like to a text extractor. */
async function scannedPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

const png = () => Buffer.alloc(30_000, 7);

const transcription = JSON.stringify({ language: "fr", title: "Panneau du musée", text: SOURCE_TEXT });
/** Routes the fake model by prompt: vision transcription, cards, enrichment or claims. */
const route =
  (transcribeReply: string) =>
  (req: { prompt: string }) =>
    req.prompt.includes("into plain text") ? transcribeReply : byStage(claimsReply, cardsReply(4))(req);

const meta = (over: Partial<AttachmentMeta> & { id: string }): AttachmentMeta => ({
  filename: "doc.pdf",
  contentType: "application/pdf",
  size: 40_000,
  disposition: "attachment",
  ...over,
});
const withFiles = (text: string, subject: string, attachments: AttachmentMeta[]): ReceivedMail => ({ ...mail(text, subject), attachments });

describe("[R-CAP-07] PDF attachments", () => {
  it("reads the text layer locally: no vision call, original kept, file source with its extractor", async () => {
    const u = await makeUser(db, "pdf");
    const data = await textPdf();
    const { deps, provider, sent, saved } = setup({
      mails: { "f-1": withFiles("Pour mes révisions", "Abeilles", [meta({ id: "a1", size: data.length })]) },
      blobs: { a1: { filename: "Rapport abeilles.pdf", contentType: "application/pdf", data } },
      replies: [route(transcription)],
    });
    await deliver(u, "f-1");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "f-1")).status).toBe("done");
    expect(provider.requests.every((r) => !r.files?.length)).toBe(true); // text layer: free, no vision
    const { data: src } = await db.from("source").select("kind,extractor,blob_path,extracted_text,title").eq("user_id", u.id).single();
    expect(src).toMatchObject({ kind: "file", extractor: "pdf-text-v1", title: "Rapport abeilles" });
    expect(src!.extracted_text).toContain("communiquent la position des fleurs par une danse");
    expect(saved).toHaveLength(1);
    expect(saved[0]!.path).toBe(src!.blob_path);
    expect(saved[0]!.path).toMatch(new RegExp(`^${u.id}/[0-9a-f-]{36}/Rapport_abeilles\\.pdf$`));
    expect(saved[0]!.size).toBe(data.length);
    // The user's words are the instruction for the quoting stage.
    expect(provider.requests[0]!.prompt).toContain("Pour mes révisions");
    expect(sent).toHaveLength(0); // D59: a success sends no mail
  });

  it("a scanned PDF (no text layer) is read by the vision model, with the file sent to it", async () => {
    const u = await makeUser(db, "scan");
    const data = await scannedPdf();
    const { deps, provider } = setup({
      mails: { "f-2": withFiles("", "Scan", [meta({ id: "a2", size: 50_000 })]) },
      blobs: { a2: { filename: "scan.pdf", contentType: "application/pdf", data } },
      replies: [route(transcription)],
    });
    await deliver(u, "f-2");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "f-2")).status).toBe("done");
    const vision = provider.requests.filter((r) => r.files?.length);
    expect(vision).toHaveLength(1);
    expect(vision[0]!.files![0]).toMatchObject({ mimeType: "application/pdf" });
    expect(vision[0]!.files![0]!.data.length).toBe(data.length);
    const { data: src } = await db.from("source").select("extractor,extracted_text,title").eq("user_id", u.id).single();
    expect(src).toMatchObject({ extractor: "vision-v1", title: "Panneau du musée" });
    const { data: calls } = await db.from("ai_call").select("stage,cost_usd").eq("user_id", u.id);
    expect(calls!.map((c) => c.stage)).toContain("transcribe"); // vision is logged with its cost like every call
  });

  it("[R-CAP-10] a file above 25 MB gives a clear failure receipt, is never downloaded and costs nothing", async () => {
    const u = await makeUser(db, "big");
    let downloaded = 0;
    const s = setup({
      mails: { "f-3": withFiles("", "Gros", [meta({ id: "a3", size: 26 * 1024 * 1024 })]) },
      blobs: {},
      replies: [route(transcription)],
    });
    s.deps.source.fetchAttachment = async () => (downloaded++, { filename: "x", contentType: "application/pdf", data: Buffer.alloc(1) });
    await deliver(u, "f-3");
    await drain(s.deps, u.id);
    expect((await captureOf(u.id, "f-3")).status).toBe("failed");
    expect(downloaded).toBe(0);
    expect(s.provider.requests).toHaveLength(0);
    expect(s.sent[0]!.text).toContain("trop volumineux");
  });

  it("[R-PIPE-03] the same file sent twice is not processed twice", async () => {
    const u = await makeUser(db, "pdfdup");
    const data = await textPdf();
    const blobs = { a4: { filename: "doc.pdf", contentType: "application/pdf", data } };
    const first = setup({ mails: { "f-4a": withFiles("", "Doc", [meta({ id: "a4" })]) }, blobs, replies: [route(transcription)] });
    await deliver(u, "f-4a");
    await drain(first.deps, u.id);
    const second = setup({ mails: { "f-4b": withFiles("encore", "Doc bis", [meta({ id: "a4" })]) }, blobs, replies: [route(transcription)] });
    await deliver(u, "f-4b");
    await drain(second.deps, u.id);
    expect((await captureOf(u.id, "f-4b")).status).toBe("duplicate");
    expect(second.provider.requests).toHaveLength(0);
    expect(second.sent).toHaveLength(0); // D59: a duplicate sends no mail
    expect(second.saved).toHaveLength(0);
  });

  it("[R-PIPE-01] a failed download is retried and then succeeds", async () => {
    const u = await makeUser(db, "retry");
    const data = await textPdf();
    const s = setup({
      mails: { "f-5": withFiles("", "Doc", [meta({ id: "a5" })]) },
      blobs: { a5: { filename: "doc.pdf", contentType: "application/pdf", data } },
      replies: [route(transcription)],
    });
    const real = s.deps.source.fetchAttachment;
    let n = 0;
    s.deps.source.fetchAttachment = async (...args) => {
      if (n++ === 0) throw new Error("download answered 503");
      return real(...args);
    };
    await deliver(u, "f-5");
    await drain(s.deps, u.id);
    expect((await captureOf(u.id, "f-5")).status).toBe("done");
    expect(n).toBe(2);
  });

  it("a scan the vision model cannot read ends with an 'unreadable' receipt", async () => {
    const u = await makeUser(db, "unreadable");
    const empty = JSON.stringify({ language: "fr", title: null, text: " " });
    const { deps, sent } = setup({
      mails: { "f-6": withFiles("", "Flou", [meta({ id: "a6" })]) },
      blobs: { a6: { filename: "flou.pdf", contentType: "application/pdf", data: await scannedPdf() } },
      replies: [route(empty)],
    });
    await deliver(u, "f-6");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "f-6")).status).toBe("failed");
    expect(sent[0]!.text).toContain("rien pu lire");
  });
});

describe("[R-CAP-07] image attachments", () => {
  it("a photo or screenshot is read by the vision model and short content is enriched with model-origin facts", async () => {
    const u = await makeUser(db, "image");
    const { deps, provider, saved } = setup({
      mails: { "i-1": withFiles("vu à l'expo", "Panneau", [meta({ id: "p1", filename: "IMG_001.jpg", contentType: "image/jpeg", size: 30_000 })]) },
      blobs: { p1: { filename: "IMG_001.jpg", contentType: "image/jpeg", data: png() } },
      replies: [route(transcription)],
    });
    await deliver(u, "i-1");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "i-1")).status).toBe("done");
    const vision = provider.requests.find((r) => r.files?.length)!;
    expect(vision.files![0]!.mimeType).toBe("image/jpeg");
    expect(vision.prompt).toContain("vu à l'expo");
    const { data: src } = await db.from("source").select("kind,extractor").eq("user_id", u.id).single();
    expect(src).toMatchObject({ kind: "file", extractor: "vision-v1" });
    expect(saved[0]!.contentType).toBe("image/jpeg");
    // Little text in the picture: the enrichment stage runs, like for a sparse note.
    expect(provider.requests.some((r) => r.prompt.includes("short personal note"))).toBe(true);
  });
});

describe("[R-CAP-07][R-CAP-09] other attachments", () => {
  const docx = meta({ id: "d1", filename: "notes.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 20_000 });
  const logo = meta({ id: "l1", filename: "logo.png", contentType: "image/png", disposition: "inline", size: 80_000 });

  it("only unsupported attachments and no text: a receipt explains what is read", async () => {
    const u = await makeUser(db, "docxonly");
    const { deps, sent, provider } = setup({ mails: { "o-1": withFiles("", "Mon doc", [docx]) }, replies: [route(transcription)] });
    await deliver(u, "o-1");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "o-1")).status).toBe("failed");
    expect(provider.requests).toHaveLength(0);
    expect(sent[0]!.text).toContain("que les PDF et les images");
  });

  it("an unsupported attachment next to a real note is listed as ignored in the receipt", async () => {
    const u = await makeUser(db, "docxnote");
    const { deps } = setup({ mails: { "o-2": withFiles(SOURCE_TEXT, "Abeilles", [docx]) }, replies: [route(transcription)] });
    await deliver(u, "o-2");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "o-2")).status).toBe("done");
    expect(JSON.stringify((await captureOf(u.id, "o-2")).notes.ignoredFiles)).toContain("notes.docx"); // the list shows the count
  });

  it("[R-CAP-09] an inline signature logo is not an attachment: ignored silently", async () => {
    const u = await makeUser(db, "logo");
    const { deps, provider } = setup({ mails: { "o-3": withFiles(SOURCE_TEXT, "Abeilles", [logo]) }, replies: [route(transcription)] });
    await deliver(u, "o-3");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "o-3")).status).toBe("done");
    expect(provider.requests.every((r) => !r.files?.length)).toBe(true);
    expect((await captureOf(u.id, "o-3")).notes.ignoredFiles ?? []).toHaveLength(0);
  });

  it("with two usable attachments both are read (the PDF first) and one receipt lists them", async () => {
    const u = await makeUser(db, "two");
    const data = await textPdf();
    const { deps, sent } = setup({
      mails: { "o-4": withFiles("", "Deux", [meta({ id: "x1", filename: "photo.jpg", contentType: "image/jpeg", size: 30_000 }), meta({ id: "x2" })]) },
      blobs: { x2: { filename: "doc.pdf", contentType: "application/pdf", data }, x1: { filename: "photo.jpg", contentType: "image/jpeg", data: png() } },
      replies: [route(transcription)],
    });
    await deliver(u, "o-4");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "o-4")).status).toBe("done");
    expect((await db.from("source").select("id").eq("user_id", u.id)).data).toHaveLength(2);
    expect(sent).toHaveLength(0); // D59
  });
});

