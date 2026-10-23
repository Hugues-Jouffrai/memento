import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { buildExportZip, deleteAccount } from "@/server/account";
import { localAdmin, makeUser } from "./support";

const db = localAdmin();

/** A user with a capture, source, page, claim, citation, two cards, a review, an invite record and an original file. */
async function seed(tag: string) {
  const u = await makeUser(db, tag);
  const { data: cap } = await db.from("capture").insert({ user_id: u.id, provider_message_id: `acc-${Math.random()}`, from_address: u.email, status: "done", raw: {} }).select("id").single();
  const { data: src } = await db.from("source").insert({ user_id: u.id, capture_id: cap!.id, kind: "user_note", title: "Ma note", extracted_text: "Les abeilles dansent.", content_hash: "h", extractor: "t", extractor_version: "1", language: "fr" }).select("id").single();
  const { data: page } = await db.from("page").insert({ user_id: u.id, source_id: src!.id, title: "Les abeilles" }).select("id").single();
  await db.from("page_version").insert({ page_id: page!.id, user_id: u.id, version: 1, summary: ["Elles dansent"] });
  const { data: claim } = await db.from("claim").insert({ user_id: u.id, page_id: page!.id, text: "Les abeilles dansent.", origin: "source" }).select("id").single();
  await db.from("citation").insert({ claim_id: claim!.id, source_id: src!.id, user_id: u.id, excerpt: "dansent" });
  const { data: card } = await db.from("card").insert({ user_id: u.id, claim_id: claim!.id, source_id: src!.id, question: "Que font les abeilles ?", answer: "Elles dansent.", status: "active" }).select("id").single();
  await db.from("fsrs_state").insert({ card_id: card!.id, user_id: u.id, fsrs_version: "5.4.2", due: new Date().toISOString(), state: 2, reps: 2 });
  await db.from("review_log").insert({ user_id: u.id, card_id: card!.id, card_version: 1, rating: 3, state_before: {}, state_after: {}, fsrs_version: "5.4.2", duration_ms: 5000 });
  await db.from("ai_call").insert({ user_id: u.id, stage: "cards", provider: "fake", model: "m", prompt_version: "v", attempt: 1, status: "ok", cost_usd: 0.001 });
  await db.from("email_out").insert({ user_id: u.id, kind: "receipt", dedup_key: "k", to_address: u.email, subject: "s" });
  await db.from("invite_use").insert({ invite_id: (await inviteId()), email: u.email });
  const path = `${u.id}/${cap!.id}/note.pdf`;
  const up = await db.storage.from("originals").upload(path, Buffer.from("%PDF-1.4 test"), { contentType: "application/pdf" });
  expect(up.error).toBeNull();
  return { ...u, path };
}
async function inviteId() {
  const { data } = await db.from("invite_code").insert({ code_hash: Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64), max_uses: 5, expires_at: new Date(Date.now() + 86_400_000).toISOString() }).select("id").single();
  return data!.id as string;
}
const rowsOf = async (id: string) => Number((await db.rpc("user_rows_count", { p_user_id: id })).data);

describe("[R-SEC-06] account export and deletion", () => {
  it("the export has the user's pages, sources, cards and reviews, and nothing of another user", async () => {
    const a = await seed("exp-a");
    const b = await seed("exp-b");
    const files = unzipSync(await buildExportZip(db, a.id, a.email));
    expect(Object.keys(files).sort()).toEqual(["README.txt", "cards.csv", "pages/les-abeilles.md", "reviews.csv", "sources.csv"]);
    expect(strFromU8(files["pages/les-abeilles.md"]!)).toContain("- Les abeilles dansent. [Ma note]");
    expect(strFromU8(files["cards.csv"]!)).toContain("Que font les abeilles ?");
    expect(strFromU8(files["sources.csv"]!)).toContain("Ma note");
    expect(strFromU8(files["reviews.csv"]!)).toContain(",3,");
    for (const content of Object.values(files)) expect(strFromU8(content)).not.toContain(b.email);
  });

  it("deleting the account leaves no row and no file of the user", async () => {
    const u = await seed("del");
    expect(await rowsOf(u.id)).toBeGreaterThan(8);
    await deleteAccount(db, u.id, u.email);
    expect(await rowsOf(u.id)).toBe(0);
    expect((await db.auth.admin.getUserById(u.id)).data.user).toBeNull();
    const { data: files } = await db.storage.from("originals").list(u.id);
    expect(files ?? []).toHaveLength(0);
    const { data: invites } = await db.from("invite_use").select("id").eq("email", u.email);
    expect(invites).toHaveLength(0);
  });

  it("deleting one account leaves another user's data untouched", async () => {
    const a = await seed("keep-a");
    const b = await seed("keep-b");
    const before = await rowsOf(b.id);
    await deleteAccount(db, a.id, a.email);
    expect(await rowsOf(b.id)).toBe(before);
    const { data } = await db.storage.from("originals").download(b.path);
    expect(data).not.toBeNull();
  });

  it("the cost log keeps no identity after deletion", async () => {
    const u = await seed("cost");
    await deleteAccount(db, u.id, u.email);
    const { data } = await db.from("ai_call").select("user_id").eq("stage", "cards").is("user_id", null).limit(1);
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});
