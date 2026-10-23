import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttachmentMeta } from "@/domain/attachments";
import type { FetchedPage } from "@/server/fetcher";
import { SOURCE_TEXT, captureOf, claimsReply, db, deliver, drain, mail, setup } from "./pipeline-support";
import { makeUser } from "./support";

/** D64: the number of cards the user asks for in their own words is honoured, and a shortfall is recorded and shown. */

const FACTS = Array.from({ length: 5 }, (_, i) => ({ text: `Teotihuacan a le fait numéro ${i + 1}, bien établi par les fouilles.`, origin: "model" as const }));
const enrichReply = JSON.stringify({ language: "fr", topic: "Teotihuacan", summary: ["Grande cité mésoaméricaine"], claims: FACTS });

type CardSpec = { claim?: number; question?: string; answer?: string };
/** A cards reply: `n` valid cards over 5 claims, each with its own question and answer, then the given overrides. */
const cardsJson = (n: number, extra: CardSpec[] = []) =>
  JSON.stringify({
    cards: [
      ...Array.from({ length: n }, (_, i) => ({ claim: (i % 5) + 1, question: `Quel élément numéro ${i + 1} de Teotihuacan est établi ?`, answer: `Élément ${i + 1}.` })),
      ...extra,
    ].map((c, i) => ({ claim: c.claim ?? 1, question: c.question ?? "", answer: c.answer ?? "Réponse.", rank: i + 1 })),
  });

/** Routes by prompt: cards, enrichment (short note) or quoting of a page. */
const route = (cards: string, enrich = enrichReply, claims = claimsReply) => (req: { prompt: string }) =>
  req.prompt.includes("write flashcards") ? cards : req.prompt.includes("short personal note") ? enrich : claims;

const cardRows = async (userId: string) => (await db.from("card").select("question,status").eq("user_id", userId).order("rank")).data!;
const promptFor = (provider: { requests: { prompt: string }[] }, marker: string) => provider.requests.find((r) => r.prompt.includes(marker))!.prompt;

afterEach(() => vi.restoreAllMocks());

describe("[R-CARD-08] an explicit count is honoured", () => {
  it("a note asking for 10 cards gets 10 when the model gives 10 valid ones; prompts v3 carry the request", async () => {
    const u = await makeUser(db, "req10");
    const { deps, provider } = setup({ mails: { "r-1": mail("Teotihuacan : fais-moi 10 cartes", "Teotihuacan") }, replies: [route(cardsJson(10))] });
    await deliver(u, "r-1");
    await drain(deps, u.id);
    const cap = await captureOf(u.id, "r-1");
    expect(cap.status).toBe("done");
    expect(cap.notes).toMatchObject({ requestedCards: 10 }); // [R-CAP-14]
    expect(cap.notes.cards).toBeUndefined(); // nothing missing
    expect(await cardRows(u.id)).toHaveLength(10);
    expect(promptFor(provider, "short personal note")).toContain("asks for 10 flashcards"); // enrichment receives the request
    expect(promptFor(provider, "write flashcards")).toContain("The user asked for 10 cards");
    const { data: calls } = await db.from("ai_call").select("stage,prompt_version").eq("user_id", u.id);
    expect(calls!.filter((c) => c.stage === "enrich" || c.stage === "cards").every((c) => c.prompt_version === "v3")).toBe(true);
  });

  it("a request below the default is honoured too: 'just 2 cards' keeps 2 of 5 valid cards", async () => {
    const u = await makeUser(db, "req2");
    const { deps } = setup({ mails: { "r-2": mail("Teotihuacan, just 2 cards please", "Teotihuacan") }, replies: [route(cardsJson(5))] });
    await deliver(u, "r-2");
    await drain(deps, u.id);
    const cap = await captureOf(u.id, "r-2");
    expect(cap.notes).toMatchObject({ requestedCards: 2 });
    expect(await cardRows(u.id)).toHaveLength(2);
    expect(cap.notes.cards).toBeUndefined(); // 2 asked, 2 made
  });

  it("without a number nothing changes: the default cap of 8 holds and the v3 prompts keep the default wording", async () => {
    const u = await makeUser(db, "reqnone");
    const { deps, provider } = setup({ mails: { "r-3": mail("Teotihuacan, j'ai visité le site hier", "Teotihuacan") }, replies: [route(cardsJson(10))] });
    await deliver(u, "r-3");
    await drain(deps, u.id);
    const cap = await captureOf(u.id, "r-3");
    expect(cap.notes.requestedCards).toBeUndefined();
    expect(cap.notes.cards).toBeUndefined();
    expect(await cardRows(u.id)).toHaveLength(8);
    expect(promptFor(provider, "write flashcards")).toContain("an array of 1 to 8 cards");
    expect(promptFor(provider, "write flashcards")).toContain("typically 3 to 5, never more than 8");
    expect(promptFor(provider, "short personal note")).toContain('"claims": 4 to 8 claims');
  });

  it("a number that is not a card count (a duration, a year) is not a request", async () => {
    const u = await makeUser(db, "reqmisfire");
    const { deps } = setup({ mails: { "r-4": mail("Teotihuacan, visité en 2022, 10 minutes de marche", "Teotihuacan") }, replies: [route(cardsJson(10))] });
    await deliver(u, "r-4");
    await drain(deps, u.id);
    const cap = await captureOf(u.id, "r-4");
    expect(cap.notes.requestedCards).toBeUndefined();
    expect(await cardRows(u.id)).toHaveLength(8);
  });
});

describe("[R-CARD-10] a shortfall is recorded and shown", () => {
  it("6 valid cards of 10 asked: counts per reason in capture.notes.cards, no text, logged", async () => {
    const u = await makeUser(db, "short");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    // 9 proposed: 6 valid, 2 duplicates of the first card, 1 yes/no. The tenth never came: not enough facts.
    const cards = cardsJson(6, [
      { claim: 1, question: "Quel élément numéro 1 de Teotihuacan est établi ?", answer: "Autre réponse." },
      { claim: 2, question: "Quel élément numéro 2 de Teotihuacan est établi ?", answer: "Autre réponse." },
      { claim: 3, question: "Est-ce que Teotihuacan est une cité précolombienne ?", answer: "Oui." },
    ]);
    const { deps } = setup({ mails: { "r-5": mail("Teotihuacan : make me 10 cards", "Teotihuacan") }, replies: [route(cards)] });
    await deliver(u, "r-5");
    await drain(deps, u.id);
    const cap = await captureOf(u.id, "r-5");
    expect(cap.status).toBe("done");
    expect(await cardRows(u.id)).toHaveLength(6);
    expect(cap.notes.cards).toEqual({ requested: 10, kept: 6, dropped: { duplicate: 2, yes_no: 1, not_enough_facts: 1 } });
    const events = info.mock.calls.map((c) => String(c[0])).filter((s) => s.includes("cards_shortfall"));
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!)).toMatchObject({ event: "cards_shortfall", capture_id: cap.id, requested: 10, kept: 6 });
    expect(JSON.stringify(cap.notes)).not.toContain("Teotihuacan est une cité"); // counts only, never card text
  });

  it("a second card on the same claim with the same answer is dropped as a duplicate (R-CARD-09)", async () => {
    const u = await makeUser(db, "angle");
    const cards = cardsJson(0, [
      { claim: 1, question: "Quel est le rôle de Teotihuacan dans la région ?", answer: "Une cité majeure." },
      { claim: 1, question: "Quelle place Teotihuacan occupe-t-elle dans la région ?", answer: "Une cité majeure." },
      { claim: 1, question: "Pourquoi Teotihuacan attire-t-elle encore les chercheurs ?", answer: "Ses bâtisseurs restent débattus." },
    ]);
    const { deps } = setup({ mails: { "r-6": mail("Teotihuacan, fais 3 cartes", "Teotihuacan") }, replies: [route(cards)] });
    await deliver(u, "r-6");
    await drain(deps, u.id);
    const cap = await captureOf(u.id, "r-6");
    expect(await cardRows(u.id)).toHaveLength(2);
    expect(cap.notes.cards).toEqual({ requested: 3, kept: 2, dropped: { duplicate: 1 } });
  });

  it("the Mails reçus data carries the shortfall for the tray (root capture only holds counts)", async () => {
    const u = await makeUser(db, "shortrow");
    const { deps } = setup({ mails: { "r-7": mail("Teotihuacan, make me 10 cards", "Teotihuacan") }, replies: [route(cardsJson(4))] });
    await deliver(u, "r-7");
    await drain(deps, u.id);
    const { data } = await db.from("capture").select("notes").eq("user_id", u.id).is("parent_id", null).single();
    expect(data!.notes.cards).toEqual({ requested: 10, kept: 4, dropped: { not_enough_facts: 6 } });
  });
});

describe("[R-CAP-14] the request in the user's words with a link or a PDF", () => {
  const PAGE_TEXT = `${SOURCE_TEXT} ${"Contexte supplémentaire sur les abeilles et leur organisation. ".repeat(12)}`;
  const page = (): FetchedPage => ({
    url: "https://fr.example.org/abeilles",
    finalUrl: "https://fr.example.org/abeilles",
    title: "Les abeilles — Encyclopédie",
    text: PAGE_TEXT,
    status: 200,
    contentType: "text/html",
    fetchedAt: new Date().toISOString(),
  });
  const twelveCards = JSON.stringify({
    cards: Array.from({ length: 12 }, (_, i) => ({ claim: (i % 2) + 1, question: `Quel aspect numéro ${i + 1} de la danse des abeilles faut-il retenir ?`, answer: `Aspect ${i + 1}.`, rank: i + 1 })),
  });

  it("a link with 'fais-moi 12 cartes' next to the URL: the quoting stage and the cards stage get 12", async () => {
    const u = await makeUser(db, "reqlink");
    const { deps, provider } = setup({
      mails: { "r-8": mail("https://fr.example.org/abeilles fais-moi 12 cartes sur la danse", "Abeilles") },
      replies: [route(twelveCards)],
      pages: async () => page(),
    });
    await deliver(u, "r-8");
    await drain(deps, u.id);
    const cap = await captureOf(u.id, "r-8");
    expect(cap.status).toBe("done");
    expect(cap.notes).toMatchObject({ requestedCards: 12 });
    expect(promptFor(provider, "turn a captured text into atomic claims")).toContain("The user asked for 12 flashcards");
    expect(await cardRows(u.id)).toHaveLength(12);
  });

  it("a PDF with the request in the mail body", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const p = doc.addPage([595, 842]);
    for (let i = 0; i < 4; i++) p.drawText(SOURCE_TEXT, { x: 20, y: 800 - i * 20, size: 8, font });
    const data = Buffer.from(await doc.save());
    const meta: AttachmentMeta = { id: "a1", filename: "abeilles.pdf", contentType: "application/pdf", size: data.length, disposition: "attachment" };
    const u = await makeUser(db, "reqpdf");
    const { deps } = setup({
      mails: { "r-9": { ...mail("Voici le cours, crée 12 cartes", "Abeilles"), attachments: [meta] } },
      blobs: { a1: { filename: "abeilles.pdf", contentType: "application/pdf", data } },
      replies: [route(twelveCards)],
    });
    await deliver(u, "r-9");
    await drain(deps, u.id);
    const cap = await captureOf(u.id, "r-9");
    expect(cap.status).toBe("done");
    expect(cap.notes).toMatchObject({ requestedCards: 12 });
    expect(await cardRows(u.id)).toHaveLength(12);
  });
});
