import { describe, expect, it } from "vitest";
import { SOURCE_TEXT, asEnrich, cardsReply, claimsReply, db, deliver, drain, mail, setup } from "./pipeline-support";
import { makeUser } from "./support";

/** Open questions from extraction (M3 step 4, D66, R-KB-14): stored with the page, capped, never a reason to fail a source. */

// Over the sparse-note limit, so the claims stage (not the enrichment of a short note) reads it.
const FILLER = " Les ouvrières nettoient la ruche, soignent le couvain et gardent l'entrée contre les intrus.".repeat(20);
const LONG_1 = SOURCE_TEXT + FILLER;
const LONG_2 = "Les abeilles butinent le nectar des fleurs et fabriquent le miel dans la ruche." + FILLER;

const claimsFor = (topic: string, claim: string, excerpt: string, questions?: string[]) =>
  JSON.stringify({ language: "fr", topic, summary: ["Résumé."], claims: [{ text: claim, excerpt }], ...(questions ? { open_questions: questions } : {}) });
const first = (questions?: string[]) => claimsFor("Danse des abeilles", "Les abeilles communiquent la position des fleurs par une danse.", "communiquent la position des fleurs par une danse", questions);
const second = (questions?: string[]) => claimsFor("Abeilles et miel", "Les abeilles butinent le nectar des fleurs.", "Les abeilles butinent le nectar des fleurs", questions);

const noFindings = JSON.stringify({ reasoning: "Aucun désaccord.", findings: [] });
const matchUpdate = JSON.stringify({ reasoning: "Même sujet.", decision: "update", page: 1, confidence: 0.95 });

function router(c1: string, c2: string, revise = noFindings) {
  return (req: { prompt: string }) => {
    if (req.prompt.includes("report only real disagreements")) return revise;
    if (req.prompt.includes("maintain a personal knowledge base")) return matchUpdate;
    if (req.prompt.includes("move between the topic pages")) return JSON.stringify({ reasoning: "Rien.", links: [] });
    if (req.prompt.includes("write flashcards")) return cardsReply(4);
    if (req.prompt.includes("short personal note")) return asEnrich(claimsReply);
    return req.prompt.includes("fabriquent le miel dans la ruche") ? c2 : c1;
  };
}

async function run(name: string, c1: string, c2?: string, revise?: string) {
  const u = await makeUser(db, name);
  const s = setup({ mails: { "q-1": mail(LONG_1, "Les abeilles"), "q-2": mail(LONG_2, "Abeilles et miel") }, replies: [router(c1, c2 ?? second(), revise)] });
  await deliver(u, "q-1");
  await drain(s.deps, u.id);
  if (c2) {
    await deliver(u, "q-2");
    await drain(s.deps, u.id);
  }
  return { u, ...s };
}

const openQuestions = async (userId: string) => (await db.from("open_question").select("text,status,capture_id,page_id").eq("user_id", userId).order("created_at")).data!;

describe("[R-KB-14] open questions from extraction", () => {
  it("stores the questions a source raises, linked to its page and capture; a text without a question mark is dropped", async () => {
    const { u } = await run("oq-store", first(["Comment les abeilles trouvent-elles le nord ?", "Une affirmation sans point d'interrogation."]));
    const rows = await openQuestions(u.id);
    expect(rows.map((r) => r.text)).toEqual(["Comment les abeilles trouvent-elles le nord ?"]);
    expect(rows[0]).toMatchObject({ status: "open" });
    expect(rows[0]!.capture_id).toBeTruthy();
    expect((await db.from("event_log").select("kind").eq("user_id", u.id).eq("kind", "question_added")).data).toHaveLength(1);
    expect((await db.from("capture").select("status").eq("user_id", u.id)).data!.every((c) => c.status === "done")).toBe(true);
  });

  it("a source without questions (or an old reply without the field) stores none", async () => {
    const { u } = await run("oq-none", first());
    expect(await openQuestions(u.id)).toEqual([]);
  });

  it("a page keeps at most 3 open questions; extra or repeated questions are dropped and the source still succeeds", async () => {
    const { u } = await run("oq-cap", first(["Première question ?", "Deuxième question ?"]), second(["Deuxième  question ?", "Troisième question ?", "Quatrième question ?"]));
    const pages = (await db.from("page").select("id").eq("user_id", u.id)).data!;
    expect(pages).toHaveLength(1);
    const rows = await openQuestions(u.id);
    expect(rows.map((r) => r.text)).toEqual(["Première question ?", "Deuxième question ?", "Troisième question ?"]);
    expect((await db.from("capture").select("status").eq("user_id", u.id)).data!.every((c) => c.status === "done")).toBe(true);
  });

  it("a short personal note (enriched by the model) never stores a question", async () => {
    const u = await makeUser(db, "oq-short");
    const s = setup({ mails: { "q-s": mail(SOURCE_TEXT, "Les abeilles") }, replies: [router(first(["Question ?"]), second())] });
    await deliver(u, "q-s");
    await drain(s.deps, u.id);
    expect(await openQuestions(u.id)).toEqual([]);
  });

  it("shadow revise sees the page's open questions and logs the one a new source answers, without resolving it", async () => {
    const revise = JSON.stringify({ reasoning: "La question 1 est répondue.", findings: [], resolves: [{ question: 1, reason: "Le nouveau fait donne la réponse." }, { question: 9, reason: "Hors liste." }] });
    const { u, provider } = await run("oq-resolve", first(["Comment les abeilles trouvent-elles le nord ?"]), second(), revise);
    const reviseCall = provider.requests.find((r) => r.prompt.includes("report only real disagreements"))!;
    expect(reviseCall.prompt).toContain("Open questions of the page:\n1. Comment les abeilles trouvent-elles le nord ?");
    const { data: rows } = await db.from("revision_shadow").select("prompt_version,would_do,error").eq("user_id", u.id);
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ prompt_version: "v2", error: null });
    const would = rows![0]!.would_do as { kind: string; detail: { text: string; reason: string } }[];
    expect(would).toHaveLength(1); // the out-of-list number is ignored
    expect(would[0]).toMatchObject({ kind: "question_resolved", detail: { text: "Comment les abeilles trouvent-elles le nord ?", reason: "Le nouveau fait donne la réponse." } });
    expect((await openQuestions(u.id)).every((q) => q.status === "open")).toBe(true);
  });
});
