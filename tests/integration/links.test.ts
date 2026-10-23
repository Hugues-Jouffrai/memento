import { describe, expect, it } from "vitest";
import { findLinks, proposeLinks } from "@/server/links";
import { NEW_PAGE } from "@/domain/kb";
import { SOURCE_TEXT, asEnrich, cardsReply, claimsReply, db, deliver, drain, mail, setup } from "./pipeline-support";
import { makeUser } from "./support";

/** The link stage (M3 step 4, D66, R-KB-12, R-KB-13): shadow log first, then live operations. */

const linkReply = (links: { candidate: number; reason: string; confidence: number }[]) => JSON.stringify({ reasoning: "Cicéron a vécu la guerre.", links });
const candidates = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Cicéron", summary: ["Orateur romain"], similarity: 0.8 },
  { id: "22222222-2222-4222-8222-222222222222", title: "Incas", summary: ["Empire andin"], similarity: 0.5 },
];
const source = { topic: "Guerre sociale", summary: ["Révolte des alliés italiens"] };

async function capture(userId: string, name: string) {
  const { data } = await db.from("capture").insert({ user_id: userId, provider_message_id: `link-${name}-${Date.now()}`, from_address: "a@example.test", status: "processing", raw: {} }).select("id").single();
  return data!.id as string;
}

describe("[R-KB-12] findLinks", () => {
  it("returns the links that pass the checks and makes no call without candidates", async () => {
    const { deps, provider } = setup({ replies: [linkReply([{ candidate: 1, reason: "Cicéron a vécu la guerre sociale.", confidence: 0.9 }, { candidate: 2, reason: "Faible.", confidence: 0.3 }])] });
    expect((await findLinks(deps.ai, null, source, [])).accepted).toEqual([]);
    expect(provider.requests).toHaveLength(0);
    const r = await findLinks(deps.ai, null, source, candidates);
    expect(r.accepted.map((l) => l.page.title)).toEqual(["Cicéron"]);
    expect(r.rejected.map((x) => x.why)).toEqual(["below the confidence bar"]);
    expect(provider.requests).toHaveLength(1);
  });
});

describe("[R-KB-12] proposeLinks", () => {
  const good = linkReply([{ candidate: 1, reason: "Cicéron a vécu la guerre sociale.", confidence: 0.9 }]);

  it("in shadow mode logs what it would link and returns no operation", async () => {
    const u = await makeUser(db, "lk-shadow");
    const cap = await capture(u.id, "a");
    const { deps } = setup({ replies: [good] });
    const ops = await proposeLinks(deps, { userId: u.id, captureId: cap, source, candidates, pageRef: NEW_PAGE }, "shadow");
    expect(ops).toEqual([]);
    const { data: row } = await db.from("link_shadow").select("mode,accepted,rejected,error,prompt_version").eq("capture_id", cap).single();
    expect(row).toMatchObject({ mode: "shadow", error: null, rejected: [], prompt_version: "v1" });
    expect(row!.accepted).toEqual([{ page: candidates[0]!.id, title: "Cicéron", reason: "Cicéron a vécu la guerre sociale.", confidence: 0.9 }]);
  });

  it("in live mode returns link_pages operations for the page the batch creates", async () => {
    const u = await makeUser(db, "lk-live");
    const cap = await capture(u.id, "b");
    const { deps } = setup({ replies: [good] });
    const ops = await proposeLinks(deps, { userId: u.id, captureId: cap, source, candidates, pageRef: NEW_PAGE }, "live");
    expect(ops).toEqual([{ op: "link_pages", page_a: NEW_PAGE, page_b: candidates[0]!.id, reason: "Cicéron a vécu la guerre sociale." }]);
  });

  it("does not ask about pages already linked, active or removed [R-KB-13]", async () => {
    const u = await makeUser(db, "lk-removed");
    const cap = await capture(u.id, "c");
    const { deps, provider } = setup({ replies: [good] });
    const ops = await proposeLinks(deps, { userId: u.id, captureId: cap, source, candidates: candidates.slice(0, 1), pageRef: "p", linkedPageIds: new Set([candidates[0]!.id]) }, "live");
    expect(ops).toEqual([]);
    expect(provider.requests).toHaveLength(0);
    expect((await db.from("link_shadow").select("id").eq("capture_id", cap)).data).toEqual([]);
  });

  it("a failing model never fails the source: no operation, the error is logged", async () => {
    const u = await makeUser(db, "lk-fail");
    const cap = await capture(u.id, "d");
    const { deps } = setup({ replies: ["pas du JSON"] });
    expect(await proposeLinks(deps, { userId: u.id, captureId: cap, source, candidates, pageRef: NEW_PAGE }, "live")).toEqual([]);
    const { data: row } = await db.from("link_shadow").select("error").eq("capture_id", cap).single();
    expect(row!.error).toBeTruthy();
  });
});

const TEXT_2 = "Les abeilles butinent le nectar des fleurs et fabriquent le miel dans la ruche avec l'aide des ouvrières.";
const claims2 = JSON.stringify({
  language: "fr",
  topic: "Abeilles et miel",
  summary: ["Les abeilles fabriquent le miel"],
  claims: [{ text: "Les abeilles butinent le nectar des fleurs.", excerpt: "Les abeilles butinent le nectar des fleurs" }],
});

describe("[R-KB-12] the link stage in the pipeline", () => {
  it("a second source with a different subject writes a shadow row and no link while in shadow mode", async () => {
    const u = await makeUser(db, "lk-pipe");
    const route = (req: { prompt: string }) => {
      if (req.prompt.includes("move between the topic pages")) return linkReply([{ candidate: 1, reason: "Les deux parlent des abeilles.", confidence: 0.9 }]);
      if (req.prompt.includes("report only real disagreements")) return JSON.stringify({ reasoning: "ok", findings: [] });
      if (req.prompt.includes("maintain a personal knowledge base")) return JSON.stringify({ reasoning: "Autre sujet.", decision: "new", page: null, confidence: 0.97 });
      if (req.prompt.includes("write flashcards")) return cardsReply(4);
      if (req.prompt.includes("short personal note")) return req.prompt.includes("butinent le nectar") ? asEnrich(claims2) : asEnrich(claimsReply);
      return req.prompt.includes("butinent le nectar") ? claims2 : claimsReply;
    };
    const s = setup({ mails: { "l-1": mail(SOURCE_TEXT, "Les abeilles"), "l-2": mail(TEXT_2, "Abeilles et miel") }, replies: [route] });
    await deliver(u, "l-1");
    await drain(s.deps, u.id);
    await deliver(u, "l-2");
    await drain(s.deps, u.id);
    expect((await db.from("page").select("id").eq("user_id", u.id)).data).toHaveLength(2);
    expect((await db.from("page_link").select("id").eq("user_id", u.id)).data).toEqual([]);
    const { data: rows } = await db.from("link_shadow").select("mode,accepted").eq("user_id", u.id);
    expect(rows).toHaveLength(1); // the first source had no candidate: no call, no row
    expect(rows![0]!.mode).toBe("shadow");
    expect((rows![0]!.accepted as unknown[]).length).toBe(1);
    expect((await db.from("capture").select("status").eq("user_id", u.id)).data!.every((c) => c.status === "done")).toBe(true);
  });
});
