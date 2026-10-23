import { describe, expect, it } from "vitest";
import { PageError, type FetchedPage } from "@/server/fetcher";
import { makeUser } from "./support";
import { SOURCE_TEXT, asEnrich, byStage, captureOf, cardsReply, claimsReply, db, deliver, drain, mail, setup } from "./pipeline-support";

describe("pipeline: email in, receipt out", () => {
  it("[M1] happy path: sources, claims, citations, cards in the tray, one receipt, costs logged", async () => {
    const u = await makeUser(db, "happy");
    const { deps, sent } = setup({ mails: { "e-1": mail() }, replies: [byStage(claimsReply, cardsReply(4))] });
    expect((await deliver(u, "e-1")).body.result).toBe("accepted");
    await drain(deps, u.id);

    expect((await captureOf(u.id, "e-1")).status).toBe("done");
    const { data: src } = await db.from("source").select("*").eq("user_id", u.id).single();
    expect(src).toMatchObject({ kind: "user_note", language: "fr" });
    const { data: claims } = await db.from("claim").select("id,origin").eq("user_id", u.id);
    expect(claims).toHaveLength(2);
    const { data: cites } = await db.from("citation").select("excerpt").eq("user_id", u.id);
    expect(cites).toHaveLength(2); // [R-KB-05] every source claim cites its source
    const { data: cards } = await db.from("card").select("status,rank").eq("user_id", u.id).order("rank");
    expect(cards).toHaveLength(4);
    expect(cards!.every((c) => c.status === "proposed")).toBe(true);

    expect(sent).toHaveLength(0); // [R-CAP-06] D59: a success sends no mail, the "Mails reçus" list shows it

    const { data: calls } = await db.from("ai_call").select("stage,status,cost_usd,prompt_version").eq("user_id", u.id);
    expect(calls!.map((c) => c.stage).sort()).toEqual(["cards", "embed", "enrich"]); // the first source has no page to match: one embedding (its page's), no match call
    expect(calls!.every((c) => c.status === "ok" && c.cost_usd !== null && c.prompt_version)).toBe(true); // [R-PIPE-07]
  });

  it("[R-PIPE-01] re-running every stage is idempotent: no duplicate rows, no second receipt", async () => {
    const u = await makeUser(db, "idem");
    const { deps, sent } = setup({ mails: { "e-2": mail() }, replies: [byStage(claimsReply, cardsReply(4))] });
    await deliver(u, "e-2");
    await drain(deps, u.id);
    const cap = await captureOf(u.id, "e-2");
    for (const stage of ["fetch", "extract", "cards", "receipt"]) {
      await db.rpc("enqueue_job", { p_user_id: u.id, p_capture_id: cap.id, p_stage: stage, p_key: `again:${stage}` });
    }
    await drain(deps, u.id);
    for (const t of ["source", "page", "claim", "citation", "card"]) {
      const { count } = await db.from(t).select("*", { count: "exact", head: true }).eq("user_id", u.id);
      expect([t, count]).toEqual([t, { source: 1, page: 1, claim: 2, citation: 2, card: 4 }[t]]);
    }
    expect(sent).toHaveLength(0); // D59: a success sends no mail
  });

  it("[R-PIPE-01] fault injection: a transient AI error recovers on retry", async () => {
    const u = await makeUser(db, "transient");
    const { deps, sent } = setup({
      mails: { "e-3": mail() },
      replies: [new Error("503 overloaded"), byStage(claimsReply, cardsReply(3))],
    });
    await deliver(u, "e-3");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "e-3")).status).toBe("done");
    expect(sent).toHaveLength(0); // D59: a success sends no mail
    const { data: calls } = await db.from("ai_call").select("status").eq("user_id", u.id);
    expect(calls!.some((c) => c.status === "provider_error")).toBe(true);
  });

  it("[R-PIPE-01][R-CAP-06] fault injection: a permanent AI error ends in failed with exactly one failure receipt", async () => {
    const u = await makeUser(db, "permanent");
    const { deps, sent } = setup({ mails: { "e-4": mail() }, replies: [new Error("500 boom")] });
    await deliver(u, "e-4");
    await drain(deps, u.id, 10);
    const cap = await captureOf(u.id, "e-4");
    expect(cap.status).toBe("failed");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("Je n'ai pas pu traiter ta note");
    const { data: job } = await db.from("job").select("status,attempts").eq("capture_id", cap.id).eq("stage", "extract").single();
    expect(job).toEqual({ status: "failed", attempts: 3 });
    const { count } = await db.from("email_out").select("*", { count: "exact", head: true }).eq("user_id", u.id);
    expect(count).toBe(1);
  });

  it("a too-short note fails at once with a plain-words receipt and makes no AI call", async () => {
    const u = await makeUser(db, "short");
    const { deps, sent, provider } = setup({ mails: { "e-5": mail("Warhol", "Expo") }, replies: [claimsReply] });
    await deliver(u, "e-5");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "e-5")).status).toBe("failed");
    expect(provider.requests).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("trop courte");
  });

  it("[R-KB-05] claims whose excerpt is not in the source are dropped; none left means a failure receipt", async () => {
    const u = await makeUser(db, "ungrounded");
    const invented = JSON.stringify({
      language: "fr", topic: "X", summary: ["x"],
      claims: [{ text: "Les abeilles vivent sur Mars.", excerpt: "Les abeilles vivent sur Mars" }],
    });
    const { deps, sent } = setup({ mails: { "e-6": mail() }, replies: [() => asEnrich(invented)] });
    await deliver(u, "e-6");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "e-6")).status).toBe("failed");
    const { count } = await db.from("claim").select("*", { count: "exact", head: true }).eq("user_id", u.id);
    expect(count).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("[R-CARD-03][R-CARD-04] invalid cards never reach the tray and the cap is 8", async () => {
    const u = await makeUser(db, "cards");
    const cards = JSON.stringify({
      cards: [
        { claim: 1, question: "Est-ce que les abeilles dansent ?", answer: "Oui", rank: 1 },
        { claim: 1, question: "Que dit l'article sur la danse ?", answer: "Elle informe", rank: 2 },
        ...Array.from({ length: 10 }, (_, i) => ({ claim: 2, question: `Quelle information la danse porte-t-elle, cas ${i} ?`, answer: `Direction ${i}`, rank: i + 3 })),
      ],
    });
    const { deps } = setup({ mails: { "e-7": mail() }, replies: [byStage(claimsReply, cards)] });
    await deliver(u, "e-7");
    await drain(deps, u.id);
    const { data } = await db.from("card").select("question").eq("user_id", u.id);
    expect(data).toHaveLength(8);
    expect(data!.some((c) => /Est-ce|l'article/.test(c.question as string))).toBe(false);
  });

  it("[R-PIPE-03] the same content sent twice is not processed twice", async () => {
    const u = await makeUser(db, "twice");
    const { deps, sent, provider } = setup({
      mails: { "e-8a": mail(), "e-8b": mail(SOURCE_TEXT, "Re-envoi") },
      replies: [byStage(claimsReply, cardsReply(4))],
    });
    await deliver(u, "e-8a");
    await drain(deps, u.id);
    const callsAfterFirst = provider.requests.length;
    await deliver(u, "e-8b");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "e-8b")).status).toBe("duplicate");
    expect(provider.requests.length).toBe(callsAfterFirst);
    expect(sent).toHaveLength(0); // D59: neither a success nor a duplicate sends a mail
    const { count } = await db.from("card").select("*", { count: "exact", head: true }).eq("user_id", u.id);
    expect(count).toBe(4);
  });

  it("[R-CAP-04] a worker killed mid-job loses nothing: the expired lease is re-claimed", async () => {
    const u = await makeUser(db, "killed");
    const { deps, sent } = setup({ mails: { "e-9": mail() }, replies: [byStage(claimsReply, cardsReply(4))] });
    await deliver(u, "e-9");
    // Simulate a worker that claimed the job and died: running, attempt counted, lease in the past.
    await db.from("job").update({ status: "running", attempts: 1, lease_until: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", u.id);
    await drain(deps, u.id);
    expect((await captureOf(u.id, "e-9")).status).toBe("done");
    expect(sent).toHaveLength(0); // D59: a success sends no mail
  });

  it("a forwarded mail uses the forwarded content as the source and the user's words as the instruction", async () => {
    const u = await makeUser(db, "fwd");
    const forwarded = `Concentre-toi sur la distance\n\n---------- Forwarded message ---------\nFrom: x@y.z\n\n${SOURCE_TEXT}\nSe désinscrire`;
    const { deps, provider } = setup({ mails: { "e-10": mail(forwarded, "Fwd: Abeilles") }, replies: [byStage(claimsReply, cardsReply(4))] });
    await deliver(u, "e-10");
    await drain(deps, u.id);
    const { data: src } = await db.from("source").select("kind,extracted_text").eq("user_id", u.id).single();
    expect(src!.kind).toBe("email_body");
    expect(src!.extracted_text).not.toMatch(/Forwarded|désinscrire/i);
    expect(provider.requests[0]!.prompt).toContain("Concentre-toi sur la distance");
  });
});

describe("[R-PIPE-05] sparse-note enrichment", () => {
  const SPARSE = "Teotihuacan. J'ai lu la page wikipédia et visité le site, appris ce qui a été découvert et le mystère.";
  const enrichReply = JSON.stringify({
    language: "fr",
    topic: "Teotihuacan",
    summary: ["Grande cité mésoaméricaine", "Fondateurs inconnus"],
    claims: [
      { text: "Teotihuacan est une cité précolombienne située près de l'actuelle Mexico.", origin: "model" },
      { text: "Les bâtisseurs de Teotihuacan restent débattus.", origin: "model" },
      { text: "Le site de Teotihuacan a été visité et sa page Wikipédia lue.", origin: "source", excerpt: "J'ai lu la page wikipédia et visité le site" },
    ],
  });
  const cardsAbout = JSON.stringify({
    cards: [
      { claim: 1, question: "Où se trouve la cité précolombienne de Teotihuacan ?", answer: "Près de l'actuelle Mexico.", rank: 1 },
      { claim: 2, question: "Que sait-on des bâtisseurs de Teotihuacan ?", answer: "Leur identité reste débattue.", rank: 2 },
    ],
  });

  it("stores model-origin claims without a citation, quoted ones with one, and says so in the data", async () => {
    const u = await makeUser(db, "enrich");
    const { deps, provider, sent } = setup({ mails: { "e-11": mail(SPARSE, "Teotihuacan") }, replies: [byStage(claimsReply, cardsAbout, enrichReply)] });
    await deliver(u, "e-11");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "e-11")).status).toBe("done");
    const { data: claims } = await db.from("claim").select("id,origin,text").eq("user_id", u.id).order("created_at");
    expect(claims!.map((c) => c.origin)).toEqual(["model", "model", "source"]);
    const { data: cites } = await db.from("citation").select("claim_id").eq("user_id", u.id);
    expect(cites).toHaveLength(1);
    expect(cites![0]!.claim_id).toBe(claims![2]!.id);
    const { data: page } = await db.from("page").select("title").eq("user_id", u.id).single();
    expect(page!.title).toBe("Teotihuacan");
    const { data: cards } = await db.from("card").select("question").eq("user_id", u.id).order("rank");
    expect(cards!.map((c) => c.question)).toEqual(["Où se trouve la cité précolombienne de Teotihuacan ?", "Que sait-on des bâtisseurs de Teotihuacan ?"]);
    expect(sent).toHaveLength(0); // D59: a success sends no mail
    expect(provider.requests[0]!.prompt).toContain("short personal note");
  });

  it("an invented quote is dropped but model-origin facts are kept", async () => {
    const u = await makeUser(db, "enrich2");
    const reply = JSON.stringify({
      language: "fr", topic: "Teotihuacan", summary: ["x"],
      claims: [
        { text: "Teotihuacan est une cité précolombienne.", origin: "model" },
        { text: "L'auteur a vu un dragon.", origin: "source", excerpt: "un dragon" },
        { text: "Sans extrait.", origin: "source" },
      ],
    });
    const { deps } = setup({ mails: { "e-12": mail(SPARSE, "Teotihuacan") }, replies: [byStage(claimsReply, cardsAbout, reply)] });
    await deliver(u, "e-12");
    await drain(deps, u.id);
    const { data: claims } = await db.from("claim").select("origin").eq("user_id", u.id);
    expect(claims).toEqual([{ origin: "model" }]);
  });

  it("[R-CARD-03] cards about the author or the reading are rejected even when the model writes them", async () => {
    const u = await makeUser(db, "enrich3");
    const bad = JSON.stringify({
      cards: [
        { claim: 1, question: "Quelle source l'auteur a-t-il consultée ?", answer: "Wikipédia", rank: 1 },
        { claim: 1, question: "Où se trouve la cité précolombienne de Teotihuacan ?", answer: "Près de Mexico.", rank: 2 },
      ],
    });
    const { deps } = setup({ mails: { "e-13": mail(SPARSE, "Teotihuacan") }, replies: [byStage(claimsReply, bad, enrichReply)] });
    await deliver(u, "e-13");
    await drain(deps, u.id);
    const { data } = await db.from("card").select("question").eq("user_id", u.id);
    expect(data).toEqual([{ question: "Où se trouve la cité précolombienne de Teotihuacan ?" }]);
  });

  it("a rich forwarded article still goes through the quoting stage, not enrichment", async () => {
    const u = await makeUser(db, "norich");
    const forwarded = "Pour mémoire\n\n---------- Forwarded message ---------\nFrom: x@y.z\n\n" + SOURCE_TEXT;
    const { deps, provider } = setup({ mails: { "e-14": mail(forwarded, "Fwd: Abeilles") }, replies: [byStage(claimsReply, cardsReply(4))] });
    await deliver(u, "e-14");
    await drain(deps, u.id);
    expect(provider.requests[0]!.prompt).not.toContain("short personal note");
    const { data } = await db.from("claim").select("origin").eq("user_id", u.id);
    expect(data!.every((c) => c.origin === "source")).toBe(true);
  });
});

describe("[R-PIPE-02] links in a note", () => {
  const PAGE_TEXT = `${SOURCE_TEXT} ${"Contexte supplémentaire sur les abeilles et leur organisation. ".repeat(12)}`;
  const page = (over: Partial<FetchedPage> = {}): FetchedPage => ({
    url: "https://fr.example.org/abeilles?utm_source=mail",
    finalUrl: "https://fr.example.org/abeilles",
    title: "Les abeilles — Encyclopédie",
    text: PAGE_TEXT,
    status: 200,
    contentType: "text/html",
    fetchedAt: new Date().toISOString(),
    ...over,
  });
  const NOTE = "J'ai lu cette page https://fr.example.org/abeilles?utm_source=mail et j'ai surtout appris la danse des abeilles";
  const noPages = async (): Promise<FetchedPage> => {
    throw new Error("the page fetcher must not be called");
  };

  it("fetches the page, stores the snapshot, uses the page as source and the user's words as instruction", async () => {
    const u = await makeUser(db, "link");
    let fetched = 0;
    const { deps, provider, sent } = setup({
      mails: { "l-1": mail(NOTE, "Abeilles") },
      replies: [byStage(claimsReply, cardsReply(4))],
      pages: async () => (fetched++, page()),
    });
    await deliver(u, "l-1");
    await drain(deps, u.id);
    expect(fetched).toBe(1);
    expect((await captureOf(u.id, "l-1")).status).toBe("done");
    const { data: src } = await db.from("source").select("kind,title,url,extracted_text,extractor").eq("user_id", u.id).single();
    expect(src).toMatchObject({ kind: "url", title: "Les abeilles — Encyclopédie", url: "https://fr.example.org/abeilles", extractor: "page-v1" });
    expect(src!.extracted_text).toBe(PAGE_TEXT);
    const cap = await captureOf(u.id, "l-1");
    expect(cap.page).toMatchObject({ finalUrl: "https://fr.example.org/abeilles", status: 200 });
    // Quoting stage, not enrichment; the instruction is the user's words without the URL.
    const prompt = provider.requests[0]!.prompt;
    expect(prompt).not.toContain("short personal note");
    expect(prompt).toContain("j'ai surtout appris la danse des abeilles");
    expect(prompt).not.toContain("utm_source");
    const { data: claims } = await db.from("claim").select("origin").eq("user_id", u.id);
    expect(claims!.every((c) => c.origin === "source")).toBe(true);
    expect(sent).toHaveLength(0); // D59: a success sends no mail
  });

  it("[R-PIPE-03] the same link sent again (other tracking parameters) is a duplicate and is not fetched again", async () => {
    const u = await makeUser(db, "linkdup");
    const first = setup({
      mails: { "l-2a": mail(NOTE, "Abeilles") },
      replies: [byStage(claimsReply, cardsReply(4))],
      pages: async () => page(),
    });
    await deliver(u, "l-2a");
    await drain(first.deps, u.id);
    const second = setup({
      mails: { "l-2b": mail("Encore https://www.fr.example.org/abeilles/?fbclid=xyz", "Re") },
      replies: [claimsReply],
      pages: noPages,
    });
    await deliver(u, "l-2b");
    await drain(second.deps, u.id);
    expect((await captureOf(u.id, "l-2b")).status).toBe("duplicate");
    expect(second.sent).toHaveLength(0);
    expect(first.sent).toHaveLength(0);
  });

  it("[R-PIPE-02] a paywalled page ends with a receipt asking for the text, and no AI call", async () => {
    const u = await makeUser(db, "paywall");
    const { deps, sent, provider } = setup({
      mails: { "l-3": mail(NOTE, "Abeilles") },
      replies: [claimsReply],
      pages: async () => page({ status: 403, text: "" }),
    });
    await deliver(u, "l-3");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "l-3")).status).toBe("failed");
    expect(provider.requests).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("réservée aux abonnés");
    expect(sent[0]!.text).toContain("Copie le texte");
  });

  it("[R-PIPE-02] an empty page (JavaScript shell) gets its own receipt", async () => {
    const u = await makeUser(db, "emptypage");
    const { deps, sent } = setup({ mails: { "l-4": mail(NOTE, "Abeilles") }, replies: [claimsReply], pages: async () => page({ text: "Loading..." }) });
    await deliver(u, "l-4");
    await drain(deps, u.id);
    expect(sent[0]!.text).toContain("presque aucun texte");
  });

  it("[R-SEC-07] a refused (internal) address is not retried and the receipt says so", async () => {
    const u = await makeUser(db, "blocked");
    let calls = 0;
    const { deps, sent } = setup({
      mails: { "l-5": mail("Regarde http://169.254.169.254/latest/meta-data/ pour voir", "Lien") },
      replies: [claimsReply],
      pages: async () => {
        calls++;
        throw new PageError("blocked", "refused address");
      },
    });
    await deliver(u, "l-5");
    await drain(deps, u.id);
    expect(calls).toBe(1);
    expect((await captureOf(u.id, "l-5")).status).toBe("failed");
    expect(sent[0]!.text).toContain("adresse non autorisée");
  });

  it("[R-PIPE-01] a timeout is retried and then succeeds; a 404 is final", async () => {
    const u = await makeUser(db, "flaky");
    let n = 0;
    const flaky = setup({
      mails: { "l-6": mail(NOTE, "Abeilles") },
      replies: [byStage(claimsReply, cardsReply(4))],
      pages: async () => {
        if (n++ === 0) throw new PageError("timeout", "page took too long");
        return page();
      },
    });
    await deliver(u, "l-6");
    await drain(flaky.deps, u.id);
    expect((await captureOf(u.id, "l-6")).status).toBe("done");
    expect(n).toBe(2);

    const v = await makeUser(db, "gone");
    const gone = setup({
      mails: { "l-7": mail("Voir https://fr.example.org/disparue", "Lien") },
      replies: [claimsReply],
      pages: async () => {
        throw new PageError("http_error", "HTTP 404", 404);
      },
    });
    await deliver(v, "l-7");
    await drain(gone.deps, v.id);
    expect((await captureOf(v.id, "l-7")).status).toBe("failed");
    expect(gone.sent[0]!.text).toContain("n'a pas pu être chargée");
  });

  it("[R-PIPE-06] a long page is read from the start and the receipt says so; the whole snapshot is kept", async () => {
    const u = await makeUser(db, "longpage");
    const long = SOURCE_TEXT + " " + "Un paragraphe de plus sur le sujet. ".repeat(1500);
    const { deps, provider } = setup({
      mails: { "l-9": mail("https://fr.example.org/longue", "Longue") },
      replies: [byStage(claimsReply, cardsReply(4))],
      pages: async () => page({ text: long }),
    });
    await deliver(u, "l-9");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "l-9")).status).toBe("done");
    expect(provider.requests[0]!.prompt.length).toBeLessThan(35_000);
    const { data: src } = await db.from("source").select("extracted_text").eq("user_id", u.id).single();
    expect(src!.extracted_text.length).toBe(long.length);
    expect((await captureOf(u.id, "l-9")).notes.truncated).toBeTruthy(); // the list shows "lecture partielle"
  });

  it("links inside a forwarded newsletter are not fetched: the forwarded content is the source", async () => {
    const u = await makeUser(db, "newsletter");
    const forwarded = `Pour mémoire\n\n---------- Forwarded message ---------\nFrom: x@y.z\n\n${SOURCE_TEXT}\nLire la suite https://fr.example.org/suite`;
    const { deps } = setup({
      mails: { "l-10": mail(forwarded, "Fwd: Infolettre") },
      replies: [byStage(claimsReply, cardsReply(4))],
      pages: noPages,
    });
    await deliver(u, "l-10");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "l-10")).status).toBe("done");
    const { data: src } = await db.from("source").select("kind").eq("user_id", u.id).single();
    expect(src!.kind).toBe("email_body");
  });
});

describe("[R-CAP-07] HTML-only mail body", () => {
  it("a mail with only an HTML part (no plain-text part) is read as text, without markup or tracking pixels", async () => {
    const u = await makeUser(db, "html");
    const html = `<html><body><p>Les abeilles communiquent la position des fleurs par une danse.</p><p>La danse frétillante indique la direction et la distance du nectar.</p><img src="https://t.example/px.gif" width="1" height="1"><script>track()</script></body></html>`;
    const { deps } = setup({
      mails: { "h-1": { subject: "Abeilles", text: null, html, messageId: null } },
      replies: [byStage(claimsReply, cardsReply(4))],
    });
    await deliver(u, "h-1");
    await drain(deps, u.id);
    expect((await captureOf(u.id, "h-1")).status).toBe("done");
    const { data: src } = await db.from("source").select("extracted_text").eq("user_id", u.id).single();
    expect(src!.extracted_text).toContain("communiquent la position des fleurs");
    expect(src!.extracted_text).not.toMatch(/<|track\(\)|px\.gif/);
  });
});

describe("[R-PIPE-05] claims about the reading are not facts", () => {
  it("a source claim that is a first-person sentence is dropped, model facts are kept", async () => {
    const u = await makeUser(db, "firstperson");
    const note = "Teotihuacan. J'ai lu la page wikipédia et visité le site, appris ce qui a été découvert et le mystère.";
    const reply = JSON.stringify({
      language: "fr", topic: "Teotihuacan", summary: ["x"],
      claims: [
        { text: "Teotihuacan est une cité précolombienne près de Mexico.", origin: "model" },
        { text: "J'ai lu la page wikipédia et visité le site.", origin: "source", excerpt: "lu la page wikipédia" },
      ],
    });
    const { deps } = setup({ mails: { "fp-1": mail(note, "Teotihuacan") }, replies: [byStage(claimsReply, cardsReply(2), reply)] });
    await deliver(u, "fp-1");
    await drain(deps, u.id);
    const { data } = await db.from("claim").select("origin,text").eq("user_id", u.id);
    expect(data).toEqual([{ origin: "model", text: "Teotihuacan est une cité précolombienne près de Mexico." }]);
  });
});
