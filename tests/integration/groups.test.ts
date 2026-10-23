import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { AttachmentMeta } from "@/domain/attachments";
import { PageError, type FetchedPage } from "@/server/fetcher";
import type { ReceivedMail } from "@/server/ports";
import { SOURCE_TEXT, byStage, captureOf, cardsReply, claimsReply, db, deliver, drain, mail, setup } from "./pipeline-support";
import { makeUser } from "./support";

/** Several links or files in one mail: each becomes its own source and capture, with one combined receipt (M3 step 0). */

const pageFor = (url: string, over: Partial<FetchedPage> = {}): FetchedPage => ({
  url,
  finalUrl: url,
  title: `Page ${url.split("/").pop()}`,
  text: SOURCE_TEXT + " " + "Un paragraphe de plus sur le sujet. ".repeat(20),
  status: 200,
  contentType: "text/html",
  fetchedAt: new Date().toISOString(),
  ...over,
});

async function textPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  for (let i = 0; i < 4; i++) page.drawText(SOURCE_TEXT, { x: 20, y: 800 - i * 20, size: 8, font });
  return Buffer.from(await doc.save());
}

const meta = (over: Partial<AttachmentMeta> & { id: string }): AttachmentMeta => ({
  filename: "doc.pdf",
  contentType: "application/pdf",
  size: 40_000,
  disposition: "attachment",
  ...over,
});
const withFiles = (text: string, subject: string, attachments: AttachmentMeta[]): ReceivedMail => ({ ...mail(text, subject), attachments });
const replies = byStage(claimsReply, cardsReply(4));
const sourcesOf = async (userId: string) => (await db.from("source").select("kind,url,title,capture_id").eq("user_id", userId)).data!;
const membersOf = async (userId: string) => (await db.from("capture").select("id,provider_message_id,parent_id,position,status").eq("user_id", userId).order("position")).data!;

describe("[R-CAP-07] a mail with several links", () => {
  it("reads every link, one source and one capture each, and sends ONE combined receipt", async () => {
    const u = await makeUser(db, "gr-links");
    const fetched: string[] = [];
    const { deps, sent } = setup({
      mails: { "g-1": mail("A lire https://fr.example.org/un puis https://fr.example.org/deux et https://fr.example.org/trois", "Trois liens") },
      replies: [replies],
      pages: async (url) => (fetched.push(url), pageFor(url)),
    });
    await deliver(u, "g-1");
    await drain(deps, u.id);

    expect(fetched.sort()).toEqual(["https://fr.example.org/deux", "https://fr.example.org/trois", "https://fr.example.org/un"]);
    const members = await membersOf(u.id);
    expect(members.map((m) => m.status)).toEqual(["done", "done", "done"]);
    expect(members.map((m) => m.position)).toEqual([0, 1, 2]);
    const root = members[0]!;
    expect(root.parent_id).toBeNull();
    expect(members.slice(1).every((m) => m.parent_id === root.id)).toBe(true);
    expect((await sourcesOf(u.id)).map((s) => s.url).sort()).toEqual(["https://fr.example.org/deux", "https://fr.example.org/trois", "https://fr.example.org/un"]);

    expect(sent).toHaveLength(0); // D59: a mail whose sources all went through sends nothing
    expect((await db.from("email_out").select("dedup_key").eq("user_id", u.id).eq("kind", "receipt")).data).toHaveLength(0);
  });

  it("a link that fails does not stop the others: the combined receipt says what happened to each", async () => {
    const u = await makeUser(db, "gr-mixed");
    const { deps, sent } = setup({
      mails: { "g-2": mail("Lis https://fr.example.org/bon et https://fr.example.org/payant", "Mélange") },
      replies: [replies],
      pages: async (url) => (url.endsWith("/payant") ? pageFor(url, { status: 403, text: "" }) : pageFor(url)),
    });
    await deliver(u, "g-2");
    await drain(deps, u.id);

    const members = await membersOf(u.id);
    expect(members.map((m) => m.status).sort()).toEqual(["done", "failed"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("Page bon");
    expect(sent[0]!.text).toContain("https://fr.example.org/payant");
    expect(sent[0]!.text).toContain("réservée aux abonnés");
  });

  it("[R-PIPE-03] a link already in the knowledge base is reported as a duplicate in the combined receipt", async () => {
    const u = await makeUser(db, "gr-dup");
    const first = setup({ mails: { "g-3a": mail("https://fr.example.org/connu", "Un") }, replies: [replies], pages: async (url) => pageFor(url) });
    await deliver(u, "g-3a");
    await drain(first.deps, u.id);

    const { deps, sent } = setup({
      mails: { "g-3b": mail("Encore https://fr.example.org/connu?utm_source=x et https://fr.example.org/nouveau", "Deux") },
      replies: [replies],
      pages: async (url) => pageFor(url),
    });
    await deliver(u, "g-3b");
    await drain(deps, u.id);

    expect(sent).toHaveLength(0);
    expect((await membersOf(u.id)).map((m) => m.status)).toContain("duplicate");
    expect((await sourcesOf(u.id)).filter((s) => s.url?.endsWith("/connu"))).toHaveLength(1);
  });

  it("at most 4 sources are read per mail; the rest is listed as not processed", async () => {
    const u = await makeUser(db, "gr-cap");
    const urls = [1, 2, 3, 4, 5, 6].map((n) => `https://fr.example.org/p${n}`);
    const fetched: string[] = [];
    const { deps, sent } = setup({
      mails: { "g-4": mail(`Pile : ${urls.join(" ")}`, "Beaucoup") },
      replies: [replies],
      pages: async (url) => (fetched.push(url), pageFor(url)),
    });
    await deliver(u, "g-4");
    await drain(deps, u.id);

    expect(fetched).toHaveLength(4);
    expect(sent).toHaveLength(0);
    expect(JSON.stringify((await captureOf(u.id, "g-4")).notes.ignoredUrls)).toContain(urls[4]!);
    expect(JSON.stringify((await captureOf(u.id, "g-4")).notes.ignoredUrls)).toContain(urls[5]!);
  });

  it("[R-PIPE-01] re-running the fetch stage creates no extra captures and sends no second receipt", async () => {
    const u = await makeUser(db, "gr-idem");
    const { deps, sent } = setup({
      mails: { "g-5": mail("https://fr.example.org/a et https://fr.example.org/b", "Deux liens") },
      replies: [replies],
      pages: async (url) => pageFor(url),
    });
    await deliver(u, "g-5");
    await drain(deps, u.id);
    const root = await captureOf(u.id, "g-5");
    // The first stage runs again (a crashed worker's retry): same members, same single receipt.
    await db.from("capture").update({ status: "received" }).eq("id", root.id);
    await db.from("job").update({ status: "queued", attempts: 0, run_after: new Date().toISOString() }).eq("capture_id", root.id).eq("stage", "fetch");
    await drain(deps, u.id);
    expect(await membersOf(u.id)).toHaveLength(2);
    expect(sent).toHaveLength(0);
  });

  it("a single link still gets its own ordinary receipt (no group)", async () => {
    const u = await makeUser(db, "gr-single");
    const { deps, sent } = setup({ mails: { "g-6": mail("https://fr.example.org/seul", "Un seul") }, replies: [replies], pages: async (url) => pageFor(url) });
    await deliver(u, "g-6");
    await drain(deps, u.id);
    expect(await membersOf(u.id)).toHaveLength(1);
    expect(sent).toHaveLength(0); // D59
  });

  it("a refused address among several links fails alone, once", async () => {
    const u = await makeUser(db, "gr-blocked");
    const { deps, sent } = setup({
      mails: { "g-7": mail("https://fr.example.org/ok et http://169.254.169.254/latest/meta-data/", "Piège") },
      replies: [replies],
      pages: async (url) => {
        if (url.includes("169.254")) throw new PageError("blocked", "refused address");
        return pageFor(url);
      },
    });
    await deliver(u, "g-7");
    await drain(deps, u.id);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("adresse non autorisée");
    expect(sent[0]!.text).toContain("Page ok");
  });
});

describe("[R-CAP-07] a mail with several files, or files and links", () => {
  it("reads a PDF and a photo and a link: three sources, one receipt", async () => {
    const u = await makeUser(db, "gr-files");
    const pdf = await textPdf();
    const transcription = JSON.stringify({ language: "fr", title: "Panneau du musée", text: SOURCE_TEXT });
    const route = (req: { prompt: string }) => (req.prompt.includes("into plain text") ? transcription : replies(req));
    const { deps, sent, saved } = setup({
      mails: {
        "g-8": withFiles("Pour mes révisions https://fr.example.org/lien", "Tout", [
          meta({ id: "i1", filename: "photo.jpg", contentType: "image/jpeg", size: 30_000 }),
          meta({ id: "p1", size: pdf.length }),
        ]),
      },
      blobs: {
        p1: { filename: "rapport.pdf", contentType: "application/pdf", data: pdf },
        i1: { filename: "photo.jpg", contentType: "image/jpeg", data: Buffer.alloc(30_000, 7) },
      },
      replies: [route],
      pages: async (url) => pageFor(url),
    });
    await deliver(u, "g-8");
    await drain(deps, u.id);

    const sources = await sourcesOf(u.id);
    expect(sources.map((s) => s.kind).sort()).toEqual(["file", "file", "url"]);
    expect(saved).toHaveLength(2); // both originals kept
    expect((await membersOf(u.id)).every((m) => m.status === "done")).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("[R-CAP-10] an oversized file among several fails alone; the others are read", async () => {
    const u = await makeUser(db, "gr-big");
    const pdf = await textPdf();
    let downloads = 0;
    const s = setup({
      mails: { "g-9": withFiles("", "Gros et petit", [meta({ id: "big", filename: "gros.pdf", size: 26 * 1024 * 1024 }), meta({ id: "ok", filename: "petit.pdf", size: pdf.length })]) },
      blobs: { ok: { filename: "petit.pdf", contentType: "application/pdf", data: pdf } },
      replies: [replies],
    });
    const fetchAttachment = s.deps.source.fetchAttachment;
    s.deps.source.fetchAttachment = async (...args) => (downloads++, fetchAttachment(...args));
    await deliver(u, "g-9");
    await drain(s.deps, u.id);
    expect(downloads).toBe(1); // only the small file was downloaded
    expect((await membersOf(u.id)).map((m) => m.status).sort()).toEqual(["done", "failed"]);
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]!.text).toContain("trop volumineux");
  });
});
