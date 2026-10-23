import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { admin, codeFrom, createUser, REVIEW_LINK_SECRET, seedProposedCards, uniqueEmail, waitForMail } from "./helpers";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle"); // let React hydrate before typing
  await page.getByLabel("Ton adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  const code = codeFrom((await waitForMail(email)).text);
  await page.waitForLoadState("networkidle"); // let React hydrate before typing
  await page.getByLabel("Code à 6 chiffres").fill(code);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByTestId("due-today")).toBeVisible();
}

function token(userId: string, expOffsetSec: number, secret = REVIEW_LINK_SECRET) {
  const payload = Buffer.from(`review.${userId}.${Math.floor(Date.now() / 1000) + expOffsetSec}`).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

test("[R-TRAY-01][R-TRAY-02] the tray lists cards by source; keeping puts them in scheduling, discarding removes them", async ({ page }) => {
  const email = uniqueEmail("tray");
  const userId = await createUser(email);
  await seedProposedCards(userId, 3);
  await login(page, email);
  await expect(page.getByTestId("tray-count")).toContainText("3 cartes");

  await page.goto("/tray");
  await expect(page.getByTestId("tray-group")).toHaveCount(1);
  await expect(page.getByTestId("tray-card")).toHaveCount(3);
  await expect(page.getByTestId("source-meta")).toContainText(/Source · (Mail|Note) · \d/); // source type and date
  await page.getByTestId("tray-card").first().getByRole("button", { name: "Supprimer" }).click();
  await expect(page.getByTestId("tray-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Tout garder" }).click();
  await expect(page.getByTestId("tray-card")).toHaveCount(0);

  const { data: cards } = await admin().from("card").select("status").eq("user_id", userId);
  expect(cards!.map((c) => c.status).sort()).toEqual(["active", "active", "discarded"]);
  const { count } = await admin().from("fsrs_state").select("*", { count: "exact", head: true }).eq("user_id", userId);
  expect(count).toBe(2);
});

test("[R-REV-02][R-SCH-02][R-REV-04] a review session grades cards, logs them, and re-teaches after Again", async ({ page }) => {
  const email = uniqueEmail("review");
  const userId = await createUser(email);
  await seedProposedCards(userId, 2);
  await login(page, email);
  await page.goto("/tray");
  await page.getByRole("button", { name: "Tout garder" }).click();
  await expect(page.getByTestId("tray-card")).toHaveCount(0);

  await page.goto("/review");
  await expect(page.getByTestId("new-badge")).toBeVisible();
  await expect(page.getByTestId("progress")).toHaveText("1 / 2");
  await expect(page.getByTestId("topic-name")).toBeVisible();
  await expect(page.getByTestId("open-topic")).toHaveCount(0); // only after the answer
  await expect(page.getByTestId("answer")).toHaveCount(0); // answer hidden until revealed
  await page.getByTestId("show-answer").click();
  await expect(page.getByTestId("answer")).toBeVisible();
  await expect(page.getByTestId("open-topic")).toBeVisible();
  await expect(page.getByTestId("forgot-note")).toContainText("jamais « Difficile »"); // [R-REV-03]
  await page.locator('button[data-grade="1"]').click(); // Again

  // R-REV-04: the claim, the source excerpt and a link to the page.
  await expect(page.getByText("Pour rappel : Les abeilles dansent")).toBeVisible();
  await expect(page.locator("blockquote q")).toHaveText("dansent pour indiquer la direction du nectar");
  await expect(page.getByRole("link", { name: "Ouvrir la fiche" })).toBeVisible();

  await page.getByRole("link", { name: "Suivant" }).click();
  await expect(page.getByTestId("progress")).toHaveText("2 / 2");
  await page.getByTestId("show-answer").click();
  await page.locator('button[data-grade="3"]').click(); // Good on the second card
  await expect(page.getByText("C'est fini pour aujourd'hui")).toBeVisible();

  const { data: log } = await admin().from("review_log").select("rating,fsrs_version,state_before,state_after").eq("user_id", userId).order("reviewed_at");
  expect(log!.map((l) => l.rating)).toEqual([1, 3]);
  expect(log!.every((l) => l.fsrs_version === "5.4.2")).toBe(true);
  const { data: states } = await admin().from("fsrs_state").select("reps,state").eq("user_id", userId);
  expect(states!.every((s) => s.reps === 1)).toBe(true);
});

test("[R-SCH-06] when the time budget is used up the session says so and offers to continue", async ({ page }) => {
  const email = uniqueEmail("budget");
  const userId = await createUser(email);
  await seedProposedCards(userId, 2);
  await login(page, email);
  await page.goto("/tray");
  await page.getByRole("button", { name: "Tout garder" }).click();
  await expect(page.getByTestId("tray-card")).toHaveCount(0);

  // Pretend 10 minutes were already spent today, and one card is a review due now (new cards wait once the budget is spent).
  const { data: card } = await admin().from("card").select("id").eq("user_id", userId).limit(1).single();
  await admin().from("fsrs_state").update({ state: 2, stability: 3, difficulty: 5, reps: 2, last_review: new Date(Date.now() - 3 * 86_400_000).toISOString(), due: new Date(Date.now() - 3_600_000).toISOString() }).eq("card_id", card!.id);
  await admin().from("review_log").insert({ user_id: userId, card_id: card!.id, card_version: 1, rating: 3, state_before: { state: 2 }, state_after: {}, duration_ms: 11 * 60_000, fsrs_version: "5.4.2" });

  await page.goto("/review");
  await expect(page.getByText("Tu as atteint ton temps de révision du jour.")).toBeVisible();
  await page.getByRole("link", { name: "Continuer quand même" }).click();
  await expect(page.getByTestId("question")).toBeVisible();
});

test("[R-REV-05] the signed review link opens the session without signing in, but nothing else", async ({ page }) => {
  const email = uniqueEmail("link");
  const userId = await createUser(email);
  await seedProposedCards(userId, 1);
  // Activate the card directly (no UI session in this test).
  const db = admin();
  const { data: card } = await db.from("card").select("id").eq("user_id", userId).single();
  await db.from("card").update({ status: "active", kept_at: new Date().toISOString() }).eq("id", card!.id);
  await db.from("fsrs_state").insert({ card_id: card!.id, user_id: userId, fsrs_version: "5.4.2", due: new Date().toISOString() });

  await page.goto(`/r/${token(userId, 3600)}`);
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByTestId("question")).toBeVisible();

  // The link grants the review session only: pages, tray and the dashboard still want a real sign-in.
  for (const path of ["/tray", "/pages"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  // R-LAND-01: / is the public landing page now; the review link must not open the home page there.
  await page.goto("/");
  await expect(page.getByTestId("landing")).toBeVisible();
  await expect(page.getByTestId("due-today")).toHaveCount(0);
});

test("[R-REV-05] an expired, tampered or wrongly signed link goes to login", async ({ page }) => {
  const userId = await createUser(uniqueEmail("badlink"));
  for (const bad of [token(userId, -10), token(userId, 3600, "another-secret"), token(userId, 3600).slice(0, -3) + "abc", "garbage"]) {
    await page.context().clearCookies();
    await page.goto(`/r/${bad}`);
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/review");
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("[R-SEC-01] another user's page is not found", async ({ page }) => {
  const mine = uniqueEmail("mine");
  await createUser(mine);
  const other = await createUser(uniqueEmail("other"));
  const { pageId } = await seedProposedCards(other, 1);
  await login(page, mine);
  const res = await page.goto(`/pages/${pageId}`);
  expect(res?.status()).toBe(404);
});

test("[R-CARD-07][R-CARD-06] during review a card can be edited (history kept) and suspended", async ({ page }) => {
  const email = uniqueEmail("edit");
  const userId = await createUser(email);
  await seedProposedCards(userId, 2);
  await login(page, email);
  await page.goto("/tray");
  await page.getByRole("button", { name: "Tout garder" }).click();
  await expect(page.getByTestId("tray-card")).toHaveCount(0);

  await page.goto("/review");
  await page.waitForLoadState("networkidle");
  const firstQuestion = (await page.getByTestId("question").textContent())!;
  await page.getByTestId("show-answer").click();
  await page.locator('button[data-grade="3"]').click(); // one review so there is a history to keep
  await expect(page.getByTestId("question")).not.toHaveText(firstQuestion); // the next card is on screen

  // Edit the second card's wording.
  await page.getByRole("link", { name: "Modifier" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Question").fill("Question corrigée ?");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("question")).toHaveText("Question corrigée ?");
  const { data: edited } = await admin().from("card").select("version,question").eq("user_id", userId).eq("question", "Question corrigée ?").single();
  expect(edited!.version).toBe(2);

  // Suspend it: the card leaves the queue, its scheduling state and status are kept.
  await page.getByRole("button", { name: "Ne plus me la poser" }).click();
  await expect(page.getByText("C'est fini pour aujourd'hui")).toBeVisible();
  const { data: cards } = await admin().from("card").select("question,status").eq("user_id", userId);
  expect(cards!.find((c) => c.question === "Question corrigée ?")!.status).toBe("suspended");
  expect(cards!.find((c) => c.question !== "Question corrigée ?")!.status).toBe("active");
  const { count } = await admin().from("review_log").select("*", { count: "exact", head: true }).eq("user_id", userId);
  expect(count).toBe(1);
});

test("[R-CARD-07][R-REV-05] the review link cannot edit or suspend cards", async ({ page }) => {
  const userId = await createUser(uniqueEmail("linktools"));
  await seedProposedCards(userId, 1);
  const db = admin();
  const { data: card } = await db.from("card").select("id").eq("user_id", userId).single();
  await db.from("card").update({ status: "active", kept_at: new Date().toISOString() }).eq("id", card!.id);
  await db.from("fsrs_state").insert({ card_id: card!.id, user_id: userId, fsrs_version: "5.4.2", due: new Date().toISOString() });
  await page.goto(`/r/${token(userId, 3600)}`);
  await expect(page.getByTestId("question")).toBeVisible();
  await expect(page.getByTestId("card-tools")).toHaveCount(0);
  await page.goto(`/review?edit=${card!.id}`);
  await expect(page.getByLabel("Question")).toHaveCount(0);
});

test("[R-REV-06][R-SCH-07] each grade shows when the card returns, and the stored due date matches the one shown", async ({ page }) => {
  const email = uniqueEmail("intervals");
  const userId = await createUser(email);
  await seedProposedCards(userId, 1);
  await login(page, email);
  await page.goto("/tray");
  await page.getByRole("button", { name: "Tout garder" }).click();
  await expect(page.getByTestId("tray-card")).toHaveCount(0);

  await page.goto("/review");
  await expect(page.getByTestId("interval")).toHaveCount(0); // nothing before the answer is shown
  await page.getByTestId("show-answer").click();
  await expect(page.getByTestId("interval")).toHaveCount(4);
  const shown = (await page.getByTestId("interval").allTextContents()).map((s) => s.replace(/\s/g, " "));
  expect(shown).toEqual(["1 min", "6 min", "10 min", "8 j"]); // a new card at the default retention
  await expect(page.locator('button[data-grade="3"] b')).toHaveText("Correct");
  await expect(page.locator('button[data-grade="3"]')).toContainText("dans 10 minutes"); // the long form for screen readers

  const before = Date.now();
  await page.locator('button[data-grade="3"]').click();
  await expect(page.getByText("C'est fini pour aujourd'hui")).toBeVisible();
  const { data } = await admin().from("fsrs_state").select("due").eq("user_id", userId).single();
  const minutes = (new Date(data!.due as string).getTime() - before) / 60_000;
  expect(minutes).toBeGreaterThan(9);
  expect(minutes).toBeLessThan(12);
});
