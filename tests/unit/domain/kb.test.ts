import { describe, expect, it } from "vitest";
import { MAX_CLAIMS_PER_PAGE, NEW_PAGE, applyOps, emptyState, type CardState, type KbState } from "@/domain/kb";

const SOURCE = "Les abeilles communiquent la position des fleurs par une danse. La danse frétillante indique la direction.";
const ctx = { sourceText: SOURCE, newPageId: "p-new" };
const create = { op: "create_page", title: "Abeilles", language: "fr", summary: ["Elles dansent"] };
const claim = (text: string, excerpt?: string, page: string = NEW_PAGE) => ({ op: "add_claim", page, text, origin: excerpt ? "source" : "model", ...(excerpt ? { excerpt } : {}) });

describe("[R-KB-03] structured operations", () => {
  it("create_page then add_claim builds the page and reports what changed", () => {
    const r = applyOps(emptyState(), [create, claim("Les abeilles dansent pour communiquer.", "communiquent la position des fleurs par une danse"), claim("Elles vivent en ruche.")], ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.pages["p-new"]).toMatchObject({ title: "Abeilles", summary: ["Elles dansent"] });
    expect(r.state.pages["p-new"]!.claims.map((c) => c.origin)).toEqual(["source", "model"]);
    expect(r.events.map((e) => e.kind)).toEqual(["page_created", "claim_added", "claim_added"]);
  });

  it("add_claim and set_summary extend an existing page", () => {
    const base = applyOps(emptyState(), [create, claim("Fait un.")], ctx);
    if (!base.ok) throw new Error("setup");
    const r = applyOps(base.state, [claim("Fait deux.", undefined, "p-new"), { op: "set_summary", page: "p-new", summary: ["Nouveau résumé", "Deux"] }], { ...ctx, newPageId: "unused" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.pages["p-new"]!.claims).toHaveLength(2);
    expect(r.state.pages["p-new"]!.summary).toEqual(["Nouveau résumé", "Deux"]);
  });

  it("[R-KB-03] a rewrite-style output is rejected: unknown operations and unknown fields never get through", () => {
    expect(applyOps(emptyState(), [{ op: "rewrite_page", page: "p", markdown: "# tout" }], ctx).ok).toBe(false);
    expect(applyOps(emptyState(), [create, { op: "set_summary", page: NEW_PAGE, summary: ["a"], text: "réécriture libre" }], ctx).ok).toBe(false);
    expect(applyOps(emptyState(), "not a list", ctx).ok).toBe(false);
    expect(applyOps(emptyState(), [], ctx).ok).toBe(false);
  });

  it("[R-KB-05] a claim from the source must quote the source: uncited or ungrounded claims are refused", () => {
    const uncited = applyOps(emptyState(), [create, { op: "add_claim", page: NEW_PAGE, text: "Fait.", origin: "source" }], ctx);
    expect(uncited).toMatchObject({ ok: false });
    const ungrounded = applyOps(emptyState(), [create, claim("Fait.", "une phrase qui n'est pas dans la source")], ctx);
    expect(ungrounded).toMatchObject({ ok: false });
    expect(applyOps(emptyState(), [create, claim("Fait.", "LA DANSE   frétillante indique la direction")], ctx).ok).toBe(true);
  });

  it("is all-or-nothing: one bad operation refuses the whole batch and leaves the input state untouched", () => {
    const base = applyOps(emptyState(), [create, claim("Fait un.")], ctx);
    if (!base.ok) throw new Error("setup");
    const before = JSON.stringify(base.state);
    const r = applyOps(base.state, [claim("Fait deux.", undefined, "p-new"), claim("Fait trois.", undefined, "ghost-page")], { ...ctx, newPageId: "x" });
    expect(r).toMatchObject({ ok: false });
    expect(JSON.stringify(base.state)).toBe(before);
  });

  it("refuses a claim the page already has (ignoring case and spacing) and an unknown page", () => {
    const base = applyOps(emptyState(), [create, claim("Fait un.")], ctx);
    if (!base.ok) throw new Error("setup");
    expect(applyOps(base.state, [claim("  fait   UN. ", undefined, "p-new")], { ...ctx, newPageId: "x" })).toMatchObject({ ok: false });
    expect(applyOps(base.state, [claim("Autre.", undefined, "nope")], { ...ctx, newPageId: "x" })).toMatchObject({ ok: false });
  });

  it("[R-KB-07] a page never exceeds its size limit", () => {
    const ops = [create, ...Array.from({ length: MAX_CLAIMS_PER_PAGE + 1 }, (_, i) => claim(`Fait numéro ${i + 1}.`))];
    const r = applyOps(emptyState(), ops, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("needs a split");
    expect(applyOps(emptyState(), ops.slice(0, MAX_CLAIMS_PER_PAGE + 1), ctx).ok).toBe(true);
  });

  it("[R-KB-07] a summary has 1 to 7 bullets and a batch creates at most one page", () => {
    expect(applyOps(emptyState(), [{ ...create, summary: Array.from({ length: 8 }, (_, i) => `b${i}`) }], ctx).ok).toBe(false);
    expect(applyOps(emptyState(), [create, create], ctx).ok).toBe(false);
  });
});

describe("[R-KB-06] revisions and contradictions", () => {
  const setup = (cards: CardState[] = []) => {
    const base = applyOps(emptyState(), [create, claim("Fait un."), claim("Fait deux.")], ctx);
    if (!base.ok) throw new Error("setup");
    return { ...base.state, cards };
  };
  const ctx2 = { ...ctx, newPageId: "unused" };

  it("revise_claim replaces the text of a claim that has no live card and logs the old and new text", () => {
    const r = applyOps(setup(), [{ op: "revise_claim", claim: "p-new#1", text: "Fait un corrigé.", reason: "source plus récente" }], ctx2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.pages["p-new"]!.claims[0]!.text).toBe("Fait un corrigé.");
    expect(r.events).toEqual([{ kind: "claim_revised", page: "p-new", detail: { claim: "p-new#1", from: "Fait un.", to: "Fait un corrigé.", reason: "source plus récente" } }]);
  });

  it("[R-CARD-06] revising a claim with a live card leaves the claim and the card alone and proposes a card update", () => {
    for (const status of ["proposed", "active", "suspended"] as const) {
      const cards: CardState[] = [{ id: "c1", claimId: "p-new#1", status }];
      const r = applyOps(setup(cards), [{ op: "revise_claim", claim: "p-new#1", text: "Fait un corrigé.", reason: "r" }], ctx2);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.state.pages["p-new"]!.claims[0]!.text).toBe("Fait un.");
      expect(r.state.cards).toEqual(cards);
      expect(r.events).toMatchObject([{ kind: "card_update_proposed", detail: { claim: "p-new#1", to: "Fait un corrigé.", cardIds: ["c1"] } }]);
    }
  });

  it("a discarded or retired card does not hold a claim back", () => {
    const cards: CardState[] = [{ id: "c1", claimId: "p-new#1", status: "discarded" }, { id: "c2", claimId: "p-new#1", status: "retired" }];
    const r = applyOps(setup(cards), [{ op: "revise_claim", claim: "p-new#1", text: "Fait un corrigé.", reason: "r" }], ctx2);
    expect(r.ok && r.state.pages["p-new"]!.claims[0]!.text).toBe("Fait un corrigé.");
  });

  it("flag_contradiction keeps both data points: the claim text stays and the other value is attached", () => {
    const cards: CardState[] = [{ id: "c1", claimId: "p-new#2", status: "active" }];
    const r = applyOps(setup(cards), [{ op: "flag_contradiction", claim: "p-new#2", new_data: "Fait deux autrement.", reason: "dates différentes" }], ctx2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.state.pages["p-new"]!.claims[1]!;
    expect(c.text).toBe("Fait deux.");
    expect(c.conflicts).toEqual([{ text: "Fait deux autrement.", reason: "dates différentes" }]);
    expect(r.state.cards).toEqual(cards);
    expect(r.events).toMatchObject([{ kind: "contradiction_flagged", detail: { cardIds: ["c1"] } }]);
  });

  it("refuses unknown claims, no-op revisions, a duplicate of another claim, and a revision without a reason", () => {
    const st = setup();
    const bad = (op: object) => applyOps(st, [op], ctx2).ok;
    expect(bad({ op: "revise_claim", claim: "ghost", text: "x", reason: "r" })).toBe(false);
    expect(bad({ op: "revise_claim", claim: "p-new#1", text: " fait   UN. ", reason: "r" })).toBe(false);
    expect(bad({ op: "revise_claim", claim: "p-new#1", text: "Fait deux.", reason: "r" })).toBe(false);
    expect(bad({ op: "revise_claim", claim: "p-new#1", text: "Autre." })).toBe(false);
    expect(bad({ op: "flag_contradiction", claim: "p-new#1", new_data: "Fait un.", reason: "r" })).toBe(false);
    expect(bad({ op: "flag_contradiction", claim: "p-new#1", new_data: "x", reason: "r", extra: 1 })).toBe(false);
  });

  it("does not modify the input state (the dry run in shadow mode must be free of side effects)", () => {
    const st = setup();
    const before = JSON.stringify(st);
    applyOps(st, [{ op: "revise_claim", claim: "p-new#1", text: "Autre.", reason: "r" }, { op: "flag_contradiction", claim: "p-new#2", new_data: "Autre deux.", reason: "r" }], ctx2);
    expect(JSON.stringify(st)).toBe(before);
  });
});

describe("[R-CARD-06] operations never change a card", () => {
  /** Seeded generator so a failure can be replayed. */
  function rng(seed: number) {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  }

  it("random batches of operations, valid or not, leave every card and every anchored claim as they were", () => {
    const next = rng(42);
    let state: KbState = emptyState();
    const first = applyOps(state, [create, claim("Fait ancré un."), claim("Fait ancré deux.")], ctx);
    if (!first.ok) throw new Error("setup");
    state = first.state;
    const cards: CardState[] = [
      { id: "c1", claimId: "p-new#1", status: "active" },
      { id: "c2", claimId: "p-new#2", status: "active" },
      { id: "c3", claimId: "p-new#1", status: "proposed" },
    ];
    state = { ...state, cards };
    const anchored = () => state.pages["p-new"]!.claims.slice(0, 2).map((c) => c.text);
    const before = { cards: JSON.stringify(state.cards), anchored: anchored() };
    const claimIds = ["p-new#1", "p-new#2", "p-new#3", "ghost#1"];
    let proposals = 0;

    for (let n = 0; n < 500; n++) {
      const ops = Array.from({ length: 1 + Math.floor(next() * 4) }, () => {
        const r = next();
        if (r < 0.35) return next() < 0.5 ? { op: "revise_claim", claim: claimIds[Math.floor(next() * 4)], text: `Révision ${Math.floor(next() * 30)}`, reason: "r" } : { op: "flag_contradiction", claim: claimIds[Math.floor(next() * 4)], new_data: `Autre donnée ${Math.floor(next() * 30)}`, reason: "r" };
        if (r < 0.6) return claim(`Fait aléatoire ${Math.floor(next() * 40)}.`, next() < 0.3 ? "une phrase absente" : undefined, next() < 0.9 ? "p-new" : "ghost");
        if (r < 0.8) return { op: "set_summary", page: "p-new", summary: Array.from({ length: Math.floor(next() * 9) }, (_, i) => `bullet ${i}`) };
        return next() < 0.5 ? create : { op: "rewrite_page", page: "p-new", markdown: "x" };
      });
      const result = applyOps(state, ops, { ...ctx, newPageId: `p-${n}` });
      if (result.ok) {
        state = result.state;
        proposals += result.events.filter((e) => e.kind === "card_update_proposed").length;
      }
      expect(JSON.stringify(state.cards)).toBe(before.cards);
      expect(anchored()).toEqual(before.anchored);
    }
    expect(state.pages["p-new"]!.claims.length).toBeGreaterThan(2);
    // The revisions aimed at the two anchored claims became proposals instead of edits.
    expect(proposals).toBeGreaterThan(0);
  });
});

describe("[R-KB-12] links between pages", () => {
  const two = (): KbState => ({
    pages: {
      "p-a": { id: "p-a", title: "Cicéron", summary: ["Orateur"], claims: [] },
      "p-b": { id: "p-b", title: "Guerre sociale", summary: ["Révolte"], claims: [] },
    },
    cards: [],
  });
  const link = (page_a: string, page_b: string, reason = "Cicéron a vécu la guerre sociale.") => ({ op: "link_pages", page_a, page_b, reason });
  const run = (state: KbState, ops: unknown[]) => applyOps(state, ops, { sourceText: "", newPageId: "p-new" });

  it("links two pages once, stored in a fixed order, and logs it", () => {
    const r = run(two(), [link("p-b", "p-a")]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.links).toEqual([{ a: "p-a", b: "p-b", reason: "Cicéron a vécu la guerre sociale.", status: "active" }]);
    expect(r.events.map((e) => e.kind)).toEqual(["link_added"]);
  });

  it("a pair that is already linked is left alone, and a removed pair is never proposed again [R-KB-13]", () => {
    const state: KbState = { ...two(), links: [{ a: "p-a", b: "p-b", reason: "avant", status: "removed" }] };
    const r = run(state, [link("p-a", "p-b", "autre raison")]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.links).toEqual([{ a: "p-a", b: "p-b", reason: "avant", status: "removed" }]);
    expect(r.events).toEqual([]);
  });

  it("can link the page the batch creates", () => {
    const r = run(two(), [create, link(NEW_PAGE, "p-a")]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.links).toHaveLength(1);
  });

  it("refuses a self-link, an unknown page (another user's page is unknown to the state) and an empty or long reason", () => {
    expect(run(two(), [link("p-a", "p-a")]).ok).toBe(false);
    expect(run(two(), [link("p-a", "p-zzz")]).ok).toBe(false);
    expect(run(two(), [link("p-a", "p-b", "")]).ok).toBe(false);
    expect(run(two(), [link("p-a", "p-b", "x".repeat(161))]).ok).toBe(false);
  });
});

describe("[R-KB-14] open questions", () => {
  const state = (): KbState => ({ pages: { "p-a": { id: "p-a", title: "Caracalla", summary: ["Empereur"], claims: [] } }, cards: [] });
  const ask = (text: string) => ({ op: "add_open_question", page: "p-a", text });
  const run = (s: KbState, ops: unknown[]) => applyOps(s, ops, { sourceText: "", newPageId: "p-new" });

  it("adds up to 3 open questions and refuses a fourth, a repeat or a long one", () => {
    const r = run(state(), [ask("Pourquoi 212 ?"), ask("Qui a conseillé l'édit ?"), ask("Quel effet fiscal ?")]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.pages["p-a"]!.questions).toHaveLength(3);
    expect(run(r.state, [ask("Une autre ?")]).ok).toBe(false);
    expect(run(state(), [ask("Pourquoi 212 ?"), ask("pourquoi  212 ?")]).ok).toBe(false);
    expect(run(state(), [ask("x".repeat(201))]).ok).toBe(false);
  });

  it("a later source can resolve a question; an unknown or already resolved one is refused", () => {
    const added = run(state(), [ask("Pourquoi 212 ?")]);
    if (!added.ok) throw new Error("setup");
    const id = added.state.pages["p-a"]!.questions![0]!.id;
    const r = run(added.state, [{ op: "resolve_open_question", question: id }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.pages["p-a"]!.questions![0]!.status).toBe("resolved");
    expect(r.events.map((e) => e.kind)).toEqual(["question_resolved"]);
    expect(run(r.state, [{ op: "resolve_open_question", question: id }]).ok).toBe(false);
    expect(run(added.state, [{ op: "resolve_open_question", question: "nope" }]).ok).toBe(false);
  });

  it("a resolved question frees a slot", () => {
    const full = run(state(), [ask("Un ?"), ask("Deux ?"), ask("Trois ?")]);
    if (!full.ok) throw new Error("setup");
    const id = full.state.pages["p-a"]!.questions![0]!.id;
    const r = run(full.state, [{ op: "resolve_open_question", question: id }, ask("Quatre ?")]);
    expect(r.ok).toBe(true);
  });

  it("[R-CARD-06] links and questions never touch a card", () => {
    const cards: CardState[] = [{ id: "c1", claimId: "p-a#1", status: "active" }];
    const s = { ...state(), cards };
    const r = run(s, [ask("Pourquoi ?")]);
    expect(r.ok && r.state.cards).toEqual(cards);
  });
});
