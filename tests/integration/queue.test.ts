import { describe, expect, it } from "vitest";
import { localParts } from "@/domain/time";
import { summarize } from "@/server/review-queue";
import { localAdmin, makeUser } from "./support";

const db = localAdmin();

/** n kept cards that are still new, plus a card to hang review-log rows on. */
async function newCards(userId: string, n: number) {
  const { data: cap } = await db.from("capture").insert({ user_id: userId, provider_message_id: `q-${Math.random()}`, from_address: "x@y.z", status: "done", raw: {} }).select("id").single();
  const { data: src } = await db.from("source").insert({ user_id: userId, capture_id: cap!.id, kind: "user_note", extracted_text: "t", content_hash: "h", extractor: "t", extractor_version: "1" }).select("id").single();
  const { data: page } = await db.from("page").insert({ user_id: userId, source_id: src!.id, title: "P" }).select("id").single();
  const { data: claim } = await db.from("claim").insert({ user_id: userId, page_id: page!.id, text: "c", origin: "source" }).select("id").single();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const { data: card } = await db.from("card").insert({ user_id: userId, claim_id: claim!.id, source_id: src!.id, question: `q${i}?`, answer: "a", status: "active", rank: i + 1 }).select("id").single();
    await db.from("fsrs_state").insert({ card_id: card!.id, user_id: userId, fsrs_version: "5.4.2", due: new Date().toISOString(), state: 0 });
    ids.push(card!.id as string);
  }
  return ids;
}

const logRow = (userId: string, cardId: string, ms: number, at: Date) => ({
  user_id: userId, card_id: cardId, card_version: 1, rating: 3, reviewed_at: at.toISOString(),
  state_before: { state: 2 }, state_after: {}, duration_ms: ms, fsrs_version: "5.4.2",
});

describe("review queue summary", () => {
  it("[R-SCH-04] uses the user's measured median seconds per review, not the 10 s default", async () => {
    const u = await makeUser(db, "median");
    const [card] = await newCards(u.id, 40);
    // 35 reviews of 20 s, a day ago: the median is 20 s, today's budget is untouched.
    const yesterday = new Date(Date.now() - 36 * 3_600_000);
    await db.from("review_log").insert(Array.from({ length: 35 }, () => logRow(u.id, card!, 20_000, yesterday)));
    const s = await summarize(db, u.id, new Date());
    expect(s.secondsPerReview).toBe(20);
    // 10 min at 20 s = 30 reviews, 80% planned = 24, 3 per new card = 8 cards, capped by the default max of 5.
    expect(s.newToday).toBe(5);
    expect(s.minutes).toBe(Math.ceil((5 * 3 * 20) / 60));
  });

  it("[R-SCH-04] falls back to 10 s with fewer than 30 timed reviews", async () => {
    const u = await makeUser(db, "fewlogs");
    const [card] = await newCards(u.id, 3);
    await db.from("review_log").insert(Array.from({ length: 5 }, () => logRow(u.id, card!, 40_000, new Date(Date.now() - 36 * 3_600_000))));
    expect((await summarize(db, u.id, new Date())).secondsPerReview).toBe(10);
  });

  it("[R-SCH-06] time already spent today shrinks the allowance", async () => {
    const u = await makeUser(db, "spent");
    const [card] = await newCards(u.id, 10);
    await db.from("profile").update({ max_new_cards: 20 }).eq("user_id", u.id);
    const before = await summarize(db, u.id, new Date());
    await db.from("review_log").insert(logRow(u.id, card!, 300_000, new Date())); // 5 of the 10 minutes
    const after = await summarize(db, u.id, new Date());
    expect(before.newToday).toBe(10); // 48 planned reviews / 3 = 16 fit, 10 cards available
    expect(after.newToday).toBe(8); // 5 min left: 24 planned reviews / 3
  });

  it("[R-SCH-05] a day that is not a study day introduces no new cards", async () => {
    const u = await makeUser(db, "offday");
    await newCards(u.id, 5);
    const now = new Date();
    const today = localParts(now, "Europe/Paris").weekday;
    await db.from("profile").update({ study_days: [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== today) }).eq("user_id", u.id);
    const s = await summarize(db, u.id, now);
    expect(s.studyDay).toBe(false);
    expect(s.newToday).toBe(0);
  });
});
