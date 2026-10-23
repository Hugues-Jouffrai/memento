import { expect, test } from "@playwright/test";
import { admin, codeFrom, createUser, seedProposedCards, uniqueEmail, waitForMail } from "./helpers";

test("[R-KB-08] a user's own topic page opens with its summary and claims", async ({ page }) => {
  const email = uniqueEmail("page");
  const userId = await createUser(email);
  const { pageId } = await seedProposedCards(userId, 1);
  await page.goto("/login");
  await page.waitForLoadState("networkidle"); // let React hydrate before typing
  await page.getByLabel("Ton adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  const code = codeFrom((await waitForMail(email)).text);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Code à 6 chiffres").fill(code);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByTestId("due-today")).toBeVisible();

  const res = await page.goto(`/pages/${pageId}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Les abeilles");
  await expect(page.getByText("Les abeilles dansent pour indiquer la direction du nectar.")).toBeVisible();
});

test("[R-KB-16] [R-KB-14] [R-KB-13] a page shows its active links and open questions, and a link opens the other page", async ({ page }) => {
  const email = uniqueEmail("links");
  const userId = await createUser(email);
  const a = await seedProposedCards(userId, 1, "Les abeilles");
  const b = await seedProposedCards(userId, 1, "Les fleurs");
  const c = await seedProposedCards(userId, 1, "Les guêpes");
  const db = admin();
  const pair = (x: string, y: string) => (x < y ? { page_a: x, page_b: y } : { page_a: y, page_b: x });
  const linkInsert = await db.from("page_link").insert([
    { user_id: userId, ...pair(a.pageId, b.pageId), reason: "Les abeilles butinent les fleurs.", status: "active" },
    { user_id: userId, ...pair(a.pageId, c.pageId), reason: "Lien retiré.", status: "removed" },
  ]);
  expect(linkInsert.error).toBeNull();
  const questionInsert = await db.from("open_question").insert([
    { user_id: userId, page_id: a.pageId, text: "Comment les abeilles trouvent-elles le nord ?", status: "open" },
    { user_id: userId, page_id: a.pageId, text: "Question déjà résolue.", status: "resolved" },
  ]);
  expect(questionInsert.error).toBeNull();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Ton adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  const code = codeFrom((await waitForMail(email)).text);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Code à 6 chiffres").fill(code);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByTestId("due-today")).toBeVisible();

  await page.goto(`/pages/${a.pageId}`);
  const related = page.getByTestId("related-pages");
  await expect(related.getByRole("heading", { name: "Fiches liées" })).toBeVisible();
  await expect(related.getByRole("link")).toHaveCount(1); // the removed link is not shown
  await expect(related).toContainText("Les abeilles butinent les fleurs.");
  await expect(page.getByTestId("open-questions")).toContainText("Comment les abeilles trouvent-elles le nord ?");
  await expect(page.getByTestId("open-questions")).not.toContainText("déjà résolue");
  await related.getByRole("link", { name: "Les fleurs" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Les fleurs");
  // The link is shown on both pages.
  await expect(page.getByTestId("related-pages").getByRole("link", { name: "Les abeilles" })).toBeVisible();
  // A page without links or questions shows neither block.
  await page.goto(`/pages/${c.pageId}`);
  await expect(page.getByTestId("related-pages")).toHaveCount(0);
  await expect(page.getByTestId("open-questions")).toHaveCount(0);
});

test("[R-KB-13] [R-KB-14] a user removes a link, resolves a question and removes another; the rows keep their status", async ({ page }) => {
  const email = uniqueEmail("close");
  const userId = await createUser(email);
  const a = await seedProposedCards(userId, 1, "Les abeilles");
  const b = await seedProposedCards(userId, 1, "Les fleurs");
  const db = admin();
  const [pa, pb] = a.pageId < b.pageId ? [a.pageId, b.pageId] : [b.pageId, a.pageId];
  expect((await db.from("page_link").insert({ user_id: userId, page_a: pa, page_b: pb, reason: "Les abeilles butinent les fleurs.", status: "active" })).error).toBeNull();
  expect(
    (
      await db.from("open_question").insert([
        { user_id: userId, page_id: a.pageId, text: "Comment les abeilles trouvent-elles le nord ?", status: "open" },
        { user_id: userId, page_id: a.pageId, text: "Combien de ruches par hectare ?", status: "open" },
      ])
    ).error,
  ).toBeNull();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Ton adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  const code = codeFrom((await waitForMail(email)).text);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Code à 6 chiffres").fill(code);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByTestId("due-today")).toBeVisible();

  await page.goto(`/pages/${a.pageId}`);
  const questions = page.getByTestId("open-questions");
  await questions.getByRole("listitem").filter({ hasText: "le nord" }).getByRole("button", { name: "marquer résolue" }).click();
  await expect(questions).not.toContainText("le nord");
  await questions.getByRole("listitem").filter({ hasText: "ruches" }).getByRole("button", { name: "retirer" }).click();
  await expect(page.getByTestId("open-questions")).toHaveCount(0);
  await page.getByTestId("related-pages").getByRole("button", { name: "Retirer le lien vers Les fleurs" }).click();
  await expect(page.getByTestId("related-pages")).toHaveCount(0);
  // The link is gone from the other page too, and nothing was deleted.
  await page.goto(`/pages/${b.pageId}`);
  await expect(page.getByTestId("related-pages")).toHaveCount(0);
  expect((await db.from("page_link").select("status").eq("user_id", userId)).data).toEqual([{ status: "removed" }]);
  const statuses = ((await db.from("open_question").select("text,status").eq("user_id", userId)).data ?? []).map((q) => `${q.text}:${q.status}`).sort();
  expect(statuses).toEqual(["Combien de ruches par hectare ?:removed", "Comment les abeilles trouvent-elles le nord ?:resolved"]);
});
