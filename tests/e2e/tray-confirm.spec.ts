import { expect, test, type Page } from "@playwright/test";
import { admin, codeFrom, createUser, seedProposedCards, uniqueEmail, waitForMail } from "./helpers";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Ton adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  const code = codeFrom((await waitForMail(email)).text);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Code à 6 chiffres").fill(code);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByTestId("due-today")).toBeVisible();
}

test("[R-TRAY-06] Tout supprimer asks first: Annuler keeps the cards, the confirmation deletes them", async ({ page }) => {
  const email = uniqueEmail("confirm");
  const userId = await createUser(email);
  await seedProposedCards(userId, 3);
  await login(page, email);
  await page.goto("/tray");
  await page.waitForLoadState("networkidle");

  await page.getByTestId("discard-all").click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("3 cartes à valider");
  await page.getByTestId("confirm-cancel").click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("tray-card")).toHaveCount(3);

  await page.getByTestId("discard-all").click();
  await page.getByTestId("confirm-ok").click();
  await expect(page.getByTestId("tray-card")).toHaveCount(0);
  const { data } = await admin().from("card").select("status").eq("user_id", userId);
  expect(data!.every((c) => c.status === "discarded")).toBe(true);
});

test("[R-TRAY-07] the end of À valider lists the received mails with their status", async ({ page }) => {
  const email = uniqueEmail("mails");
  const userId = await createUser(email);
  const row = (id: string, subject: string, status: string) => ({ user_id: userId, provider_message_id: id, from_address: email, subject, status, route: "token", raw: {} });
  const { error } = await admin()
    .from("capture")
    .insert([row("m-1", "Les abeilles", "done"), row("m-2", "Re: Un article", "failed"), row("m-3", "Encore", "duplicate"), row("m-4", "Spam", "rejected")]);
  expect(error).toBeNull();
  await login(page, email);
  await page.goto("/tray");

  const rows = page.getByTestId("mail-row");
  await expect(rows).toHaveCount(3); // a rejected mail (foreign sender) is not listed
  await expect(page.getByTestId("mail-list")).toContainText("Mails reçus");
  await expect(rows.filter({ hasText: "Les abeilles" })).toContainText("Traité");
  await expect(rows.filter({ hasText: "Un article" })).toContainText("Échec");
  await expect(rows.filter({ hasText: "Encore" })).toContainText("Déjà dans ta base");
  await expect(page.getByTestId("mail-shortfall")).toHaveCount(0); // no shortfall line when nothing was asked for
});

test("[R-CARD-10] a mail that got fewer cards than asked shows the counts per reason", async ({ page }) => {
  const email = uniqueEmail("shortfall");
  const userId = await createUser(email);
  const notes = { requestedCards: 10, cards: { requested: 10, kept: 6, dropped: { duplicate: 2, yes_no: 1, not_enough_facts: 1 } } };
  const { error } = await admin()
    .from("capture")
    .insert({ user_id: userId, provider_message_id: "s-1", from_address: email, subject: "Teotihuacan", status: "done", route: "token", raw: {}, notes });
  expect(error).toBeNull();
  await login(page, email);
  await page.goto("/tray");
  const line = page.getByTestId("mail-row").filter({ hasText: "Teotihuacan" }).getByTestId("mail-shortfall");
  await expect(line).toContainText("10 demandées, 6 créées");
  await expect(line).toContainText("2 doublons");
  await expect(line).toContainText("1 question oui/non");
  await expect(line).toContainText("1 pas assez de faits");
});

test("[R-UI-04] on a wide screen the wordmark is large and its M is the logo; its name stays Memento", async ({ page }) => {
  const email = uniqueEmail("wordmark");
  await createUser(email);
  await page.setViewportSize({ width: 1200, height: 800 });
  await login(page, email);
  const brand = page.locator(".bar .brand");
  await expect(brand).toHaveCount(1);
  await expect(brand).toContainText("Memento"); // the visually hidden full name
  await expect(brand.locator("svg.wm-m")).toBeVisible();
  const size = await brand.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(28);
});
