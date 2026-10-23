import { expect, test, type Page } from "@playwright/test";
import { admin, codeFrom, createUser, seedProposedCards, uniqueEmail, waitForMail } from "./helpers";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle"); // let React hydrate before typing
  await page.getByLabel("Ton adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  const code = codeFrom((await waitForMail(email)).text);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Code à 6 chiffres").fill(code);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByTestId("due-today")).toBeVisible();
}

test("[R-ONB-01] signed out, /help goes to login", async ({ page }) => {
  await page.goto("/help");
  await expect(page).toHaveURL(/\/login$/);
});

test("[R-ONB-01][R-ONB-03] /help shows five sections in order, the user's own address and the screens' own labels", async ({ page }) => {
  const email = uniqueEmail("help");
  await createUser(email);
  await login(page, email);
  await page.goto("/help");
  const headings = await page.locator("main ol.help-sections > li > h2").allInnerTexts();
  expect(headings).toEqual(["Envoyer", "À valider", "Réviser", "Le rappel", "Fiches / Paramètres"]);
  await expect(page.getByTestId("help-address")).toContainText("add@");
  await expect(page.getByText(email).first()).toBeVisible();
  await expect(page.getByText("« À revoir »").first()).toBeVisible(); // review.again, quoted from the review screen's own key
  await expect(page.getByText("à 18:00").first()).toBeVisible(); // the profile's reminder time
});

test("[R-ONB-01] help is reachable from Paramètres, the empty tray and the home page", async ({ page }) => {
  const email = uniqueEmail("helplinks");
  await createUser(email);
  await login(page, email);
  await page.goto("/settings");
  await expect(page.getByTestId("settings-help-link")).toBeVisible();
  await page.goto("/tray");
  await expect(page.getByTestId("empty-help-link")).toBeVisible();
  await page.goto("/pages");
  await expect(page.getByTestId("empty-help-link")).toBeVisible();
});

test("[R-ONB-04] the try button is a mailto to the user's own address with the sample note", async ({ page }) => {
  const email = uniqueEmail("try");
  await createUser(email);
  await login(page, email);
  await page.goto("/help");
  const href = (await page.getByTestId("help-try").getAttribute("href"))!;
  expect(href.startsWith("mailto:add@")).toBe(true);
  const url = new URL(href);
  expect(url.searchParams.get("subject")).toBe("Ma première note");
  expect(url.searchParams.get("body")).toContain("abeilles");
  expect(href).not.toContain(email.split("@")[0]!);
});

test("[R-ONB-02] a new user sees three open steps; hiding is permanent across browsers; a full user never sees it", async ({ page, browser }) => {
  const email = uniqueEmail("first");
  const id = await createUser(email);
  await login(page, email);
  const card = page.getByTestId("first-run");
  await expect(card).toBeVisible();
  await expect(card.getByText("à faire")).toHaveCount(3);
  await expect(card.getByTestId("first-run-try")).toHaveAttribute("href", /^mailto:add@/);

  await admin().from("capture").insert({ user_id: id, provider_message_id: `fr-${Date.now()}`, from_address: email, status: "received", raw: {} });
  await page.reload();
  await expect(card.getByText("fait")).toHaveCount(1);

  await card.getByRole("button", { name: "Masquer" }).click();
  await expect(card).toHaveCount(0);
  // Stored on the account, not in the browser: every device sees it hidden.
  const { data: prof } = await admin().from("profile").select("onboarding_dismissed_at").eq("user_id", id).single();
  expect(prof!.onboarding_dismissed_at).not.toBeNull();
  await page.reload();
  await expect(card).toHaveCount(0);

  const email2 = uniqueEmail("done");
  const id2 = await createUser(email2);
  const { sourceId } = await seedProposedCards(id2, 1);
  await admin().from("card").update({ status: "active", kept_at: new Date().toISOString() }).eq("user_id", id2);
  const { data: c } = await admin().from("card").select("id").eq("user_id", id2).single();
  await admin().from("review_log").insert({ user_id: id2, card_id: c!.id, card_version: 1, rating: 3, state_before: {}, state_after: {}, fsrs_version: "5.4.2" });
  expect(sourceId).toBeTruthy();
  const page3 = await (await browser.newContext()).newPage();
  await login(page3, email2);
  await expect(page3.getByTestId("first-run")).toHaveCount(0);
});
