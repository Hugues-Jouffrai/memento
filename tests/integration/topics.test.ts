import { describe, expect, it } from "vitest";
import { SOURCE_TEXT, asEnrich, cardsReply, claimsReply, db, deliver, drain, mail, setup } from "./pipeline-support";
import { makeUser } from "./support";

/** Topic matching (M3 step 1, R-KB-02): a source joins an existing page of the same subject, else it gets its own. */

const TEXT_2 = "Les abeilles butinent le nectar des fleurs et fabriquent le miel dans la ruche avec l'aide des ouvrières.";
const claims2 = JSON.stringify({
  language: "fr",
  topic: "Abeilles et miel",
  summary: ["Les abeilles fabriquent le miel", "Les ouvrières butinent"],
  claims: [
    { text: "Les abeilles butinent le nectar des fleurs.", excerpt: "Les abeilles butinent le nectar des fleurs" },
    { text: "Les abeilles fabriquent le miel dans la ruche.", excerpt: "fabriquent le miel dans la ruche" },
  ],
});
const matchReply = (decision: "update" | "new", page: number | null, confidence: number) =>
  JSON.stringify({ reasoning: "Même sujet.", decision, page, confidence });

const noFindings = JSON.stringify({ reasoning: "Aucun désaccord.", findings: [] });

/** Routes the fake model: match decision, revise findings, cards, enrichment of source 1 or 2 (told apart by their text), claims. */
const route = (match: string, revise: string = noFindings) => (req: { prompt: string }) => {
  if (req.prompt.includes("report only real disagreements")) return revise;
  if (req.prompt.includes("maintain a personal knowledge base")) return match;
  if (req.prompt.includes("write flashcards")) return cardsReply(4);
  if (req.prompt.includes("short personal note")) return req.prompt.includes("butinent le nectar") ? asEnrich(claims2) : asEnrich(claimsReply);
  return req.prompt.includes("butinent le nectar") ? claims2 : claimsReply;
};

const pagesOf = async (userId: string) => (await db.from("page").select("id,title,embedding_model").eq("user_id", userId)).data!;
const matchCalls = (requests: { prompt: string }[]) => requests.filter((r) => r.prompt.includes("maintain a personal knowledge base") && !r.prompt.includes("report only real disagreements"));

async function twoMails(name: string, match: string, second: string = TEXT_2, revise?: string) {
  const u = await makeUser(db, name);
  const s = setup({ mails: { "t-1": mail(SOURCE_TEXT, "Les abeilles"), "t-2": mail(second, "Abeilles et miel") }, replies: [route(match, revise)] });
  await deliver(u, "t-1");
  await drain(s.deps, u.id);
  await deliver(u, "t-2");
  await drain(s.deps, u.id);
  return { u, ...s };
}

describe("[R-KB-02] topic matching in the pipeline", () => {
  it("a source about the same subject joins the existing page: one page, two sources, a new version, new claims and cards only", async () => {
    const { u, sent, provider } = await twoMails("tm-update", matchReply("update", 1, 0.95));
    const pages = await pagesOf(u.id);
    expect(pages).toHaveLength(1);
    expect((await db.from("source_page").select("source_id").eq("page_id", pages[0]!.id)).data).toHaveLength(2);
    expect((await db.from("page_version").select("version").eq("page_id", pages[0]!.id).order("version")).data!.map((v) => v.version)).toEqual([1, 2]);
    const { data: v2 } = await db.from("page_version").select("summary").eq("page_id", pages[0]!.id).eq("version", 2).single();
    expect(v2!.summary).toEqual(["Les abeilles dansent pour communiquer", "La danse indique direction et distance", "Les abeilles fabriquent le miel", "Les ouvrières butinent"]);
    const { data: claims } = await db.from("claim").select("text,capture_id").eq("page_id", pages[0]!.id);
    expect(claims).toHaveLength(4);
    expect(new Set(claims!.map((c) => c.capture_id)).size).toBe(2);
    // The second capture's cards come from its own claims only (the first page's older claims keep their cards).
    expect((await db.from("card").select("id").eq("user_id", u.id)).data).toHaveLength(8);
    expect(sent).toHaveLength(0); // D59: no success mail
    expect(matchCalls(provider.requests)).toHaveLength(1);
    const { data: log } = await db.from("match_log").select("decision,page_id,confidence").eq("user_id", u.id).order("created_at");
    expect(log).toEqual([
      { decision: "new", page_id: null, confidence: 1 }, // the first source: nothing to match
      { decision: "update", page_id: pages[0]!.id, confidence: 0.95 },
    ]);
  });

  it("a different subject gets its own page", async () => {
    const { u } = await twoMails("tm-new", matchReply("new", null, 0.97));
    expect(await pagesOf(u.id)).toHaveLength(2);
    expect((await db.from("capture").select("status").eq("user_id", u.id)).data!.every((c) => c.status === "done")).toBe(true);
  });

  it("a duplicate is cheaper than a false merge: an 'update' below the confidence threshold creates a new page", async () => {
    const { u } = await twoMails("tm-low", matchReply("update", 1, 0.6));
    expect(await pagesOf(u.id)).toHaveLength(2);
  });

  it("an answer naming a candidate that does not exist creates a new page", async () => {
    const { u } = await twoMails("tm-range", matchReply("update", 4, 0.99));
    expect(await pagesOf(u.id)).toHaveLength(2);
  });

  it("[R-PIPE-01] a failing matching step never fails the capture: the source gets its own page", async () => {
    const { u } = await twoMails("tm-broken", "this is not json");
    expect(await pagesOf(u.id)).toHaveLength(2);
    expect((await db.from("capture").select("status").eq("user_id", u.id)).data!.every((c) => c.status === "done")).toBe(true);
  });

  it("every page is stored with its embedding and the model that made it; an extended page is re-embedded", async () => {
    const { u, provider } = await twoMails("tm-embed", matchReply("update", 1, 0.95));
    const [page] = await pagesOf(u.id);
    expect(page!.embedding_model).toBe("gemini-embedding-2");
    expect(provider.embedRequests.every((r) => r.dimensions === 768)).toBe(true);
    // 1st source: one embedding (its page). 2nd: one for matching, one for the merged page.
    expect(provider.embedRequests).toHaveLength(3);
  });

  it("a source that only repeats what the page already says adds no claims and no cards, and the receipt says so", async () => {
    const { u, sent } = await twoMails("tm-repeat", matchReply("update", 1, 0.95), SOURCE_TEXT + " Encore une phrase pour changer le texte du mail.");
    expect(await pagesOf(u.id)).toHaveLength(1);
    expect((await db.from("claim").select("id").eq("user_id", u.id)).data).toHaveLength(2);
    expect((await db.from("card").select("id").eq("user_id", u.id)).data).toHaveLength(4);
    expect((await db.from("capture").select("status").eq("user_id", u.id)).data!.every((c) => c.status === "done")).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("[R-SEC-01] another user's pages are never candidates: no match call, a page of its own", async () => {
    const a = await makeUser(db, "tm-iso-a");
    const b = await makeUser(db, "tm-iso-b");
    const s = setup({ mails: { "t-a": mail(SOURCE_TEXT, "Les abeilles"), "t-b": mail(TEXT_2, "Abeilles et miel") }, replies: [route(matchReply("update", 1, 0.99))] });
    await deliver(a, "t-a");
    await drain(s.deps, a.id);
    await deliver(b, "t-b");
    await drain(s.deps, b.id);
    expect(await pagesOf(a.id)).toHaveLength(1);
    expect(await pagesOf(b.id)).toHaveLength(1);
    expect(matchCalls(s.provider.requests)).toHaveLength(0);
  });

  it("[R-KB-02] two links of one mail about the same subject are matched one after the other, never both creating a page", async () => {
    const u = await makeUser(db, "tm-group");
    const s = setup({
      mails: { "t-g": mail("https://fr.example.org/un et https://fr.example.org/deux", "Deux liens") },
      replies: [route(matchReply("update", 1, 0.95))],
      pages: async (url) => ({
        url,
        finalUrl: url,
        title: "Abeilles",
        text: url.endsWith("/un") ? SOURCE_TEXT + " Un paragraphe de plus. ".repeat(20) : TEXT_2 + " Un autre paragraphe. ".repeat(20),
        status: 200,
        contentType: "text/html",
        fetchedAt: new Date().toISOString(),
      }),
    });
    await deliver(u, "t-g");
    await drain(s.deps, u.id);
    expect((await db.from("capture").select("status,error").eq("user_id", u.id)).data!).toEqual([{ status: "done", error: null }, { status: "done", error: null }]);
    expect(await pagesOf(u.id)).toHaveLength(1);
  });
});

describe("[R-KB-03] [R-KB-04] knowledge-base updates are logged operations", () => {
  it("each capture's changes are in event_log: a new page logs its creation and claims, an extended page its summary and new claims", async () => {
    const { u } = await twoMails("tm-events", matchReply("update", 1, 0.95));
    const { data: caps } = await db.from("capture").select("id,provider_message_id").eq("user_id", u.id);
    const kindsOf = async (emailId: string) => {
      const id = caps!.find((c) => c.provider_message_id === emailId)!.id;
      return (await db.from("event_log").select("kind").eq("capture_id", id).order("created_at")).data!.map((e) => e.kind);
    };
    expect(await kindsOf("t-1")).toEqual(["page_created", "claim_added", "claim_added"]);
    expect(await kindsOf("t-2")).toEqual(["summary_set", "claim_added", "claim_added"]);
  });

  it("one bad claim does not cost the others: a repeated or ungrounded claim is dropped, the rest is stored", async () => {
    const u = await makeUser(db, "tm-badclaim");
    const reply = JSON.stringify({
      language: "fr",
      topic: "Danse des abeilles",
      summary: ["Elles dansent"],
      claims: [
        { text: "Les abeilles communiquent la position des fleurs par une danse.", origin: "source", excerpt: "communiquent la position des fleurs par une danse" },
        { text: "Les abeilles communiquent la position des fleurs par une danse.", origin: "source", excerpt: "communiquent la position des fleurs par une danse" },
        { text: "Une phrase inventée.", origin: "source", excerpt: "cette phrase n'existe pas dans la note" },
        { text: "Elles vivent en colonies.", origin: "model" },
      ],
    });
    const s = setup({ mails: { "t-b": mail(SOURCE_TEXT, "Les abeilles") }, replies: [(req: { prompt: string }) => (req.prompt.includes("write flashcards") ? cardsReply(4) : reply)] });
    await deliver(u, "t-b");
    await drain(s.deps, u.id);
    expect((await db.from("claim").select("text").eq("user_id", u.id)).data!.map((c) => c.text).sort()).toEqual(["Elles vivent en colonies.", "Les abeilles communiquent la position des fleurs par une danse."]);
    expect((await db.from("capture").select("status").eq("user_id", u.id)).data![0]!.status).toBe("done");
  });
});

describe("[R-KB-06] shadow revisions: logged, never applied", () => {
  const finding = (kind: "revise" | "contradiction", text: string | null = null) =>
    JSON.stringify({ reasoning: "Désaccord.", findings: [{ kind, existing: 1, new: 1, text, reason: "Les deux faits diffèrent." }] });
  const reviseCalls = (requests: { prompt: string }[]) => requests.filter((r) => r.prompt.includes("report only real disagreements"));
  const snapshot = async (userId: string) => ({
    claims: (await db.from("claim").select("id,text,status").eq("user_id", userId).order("id")).data,
    cards: (await db.from("card").select("id,status,claim_id").eq("user_id", userId).order("id")).data,
    versions: (await db.from("page_version").select("page_id,version").eq("user_id", userId).order("version")).data,
  });

  it("a source that joins a page with claims gets one revise call and a shadow row; nothing else changes", async () => {
    const { u, provider } = await twoMails("sh-contra", matchReply("update", 1, 0.95), TEXT_2, finding("contradiction"));
    expect(reviseCalls(provider.requests)).toHaveLength(1);
    const { data: rows } = await db.from("revision_shadow").select("*").eq("user_id", u.id);
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ prompt_version: "v2", model: "gemini-3.8-flash", error: null });
    const f = rows![0]!.findings as { kind: string; existing: string; incoming: string; incomingOrigin: string }[];
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "contradiction", incomingOrigin: "source" });
    const { data: pageClaims } = await db.from("claim").select("text").eq("user_id", u.id);
    expect(pageClaims!.map((c) => c.text)).toContain(f[0]!.existing);
    expect(f[0]!.incoming).toMatch(/butinent|miel/);
    // The page's first source has live (proposed) cards: the dry run records the flag with its card, applying nothing.
    expect((rows![0]!.would_do as { kind: string }[]).map((e) => e.kind)).toEqual(["contradiction_flagged"]);
    expect(await db.from("event_log").select("kind").eq("user_id", u.id).like("kind", "%contradiction%")).toMatchObject({ data: [] });
  });

  it("[R-CARD-06] a revision of a claim with a live card is logged as a card update proposal; the claim and the card are untouched", async () => {
    const dryRun = await twoMails("sh-revise-a", matchReply("update", 1, 0.95), TEXT_2, finding("revise", "Texte corrigé de la première affirmation."));
    const { data: rows } = await db.from("revision_shadow").select("findings,would_do").eq("user_id", dryRun.u.id);
    expect((rows![0]!.would_do as { kind: string; detail: { to: string; cardIds: string[] } }[])).toMatchObject([{ kind: "card_update_proposed", detail: { to: "Texte corrigé de la première affirmation." } }]);
    expect((rows![0]!.would_do as { detail: { cardIds: string[] } }[])[0]!.detail.cardIds.length).toBeGreaterThan(0);
    const after = await snapshot(dryRun.u.id);
    expect(after.claims!.some((c) => c.text.startsWith("Texte corrigé"))).toBe(false);
    expect(after.claims!.every((c) => c.status === "active")).toBe(true);
    expect(after.cards!.filter((c) => c.status === "proposed")).toHaveLength(8);
  });

  it("the same pipeline without findings gives the same claims, cards and versions (shadow mode changes nothing)", async () => {
    const withFinding = await twoMails("sh-same-a", matchReply("update", 1, 0.95), TEXT_2, finding("revise", "Autre texte."));
    const without = await twoMails("sh-same-b", matchReply("update", 1, 0.95));
    const shape = async (userId: string) => {
      const s = await snapshot(userId);
      return { claims: s.claims!.map((c) => c.text).sort(), cards: s.cards!.map((c) => c.status), versions: s.versions!.map((v) => v.version) };
    };
    expect(await shape(withFinding.u.id)).toEqual(await shape(without.u.id));
  });

  it("no findings: a row with empty lists; a source that starts a page gets no revise call", async () => {
    const { u, provider } = await twoMails("sh-none", matchReply("update", 1, 0.95));
    const { data: rows } = await db.from("revision_shadow").select("findings,rejected,would_do").eq("user_id", u.id);
    expect(rows).toEqual([{ findings: [], rejected: [], would_do: [] }]);
    const sep = await twoMails("sh-newpage", matchReply("new", null, 0.97));
    expect(reviseCalls(sep.provider.requests)).toHaveLength(0);
    expect((await db.from("revision_shadow").select("id").eq("user_id", sep.u.id)).data).toHaveLength(0);
    expect(reviseCalls(provider.requests)).toHaveLength(1);
  });

  it("[R-PIPE-01] a failing revise call never fails the capture: the row records the error", async () => {
    const { u } = await twoMails("sh-broken", matchReply("update", 1, 0.95), TEXT_2, "this is not json");
    expect((await db.from("capture").select("status").eq("user_id", u.id)).data!.every((c) => c.status === "done")).toBe(true);
    const { data: rows } = await db.from("revision_shadow").select("error,findings").eq("user_id", u.id);
    expect(rows).toHaveLength(1);
    expect(rows![0]!.error).toContain("revise");
  });

  it("a finding pointing at a claim that does not exist is refused and recorded, not applied", async () => {
    const bad = JSON.stringify({ reasoning: "x", findings: [{ kind: "contradiction", existing: 9, new: 1, text: null, reason: "r" }] });
    const { u } = await twoMails("sh-range", matchReply("update", 1, 0.95), TEXT_2, bad);
    const { data: rows } = await db.from("revision_shadow").select("findings,rejected").eq("user_id", u.id);
    expect(rows![0]!.findings).toEqual([]);
    expect(rows![0]!.rejected).toMatchObject([{ why: "unknown claim number" }]);
  });
});
