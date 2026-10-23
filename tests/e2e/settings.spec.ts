import { expect, test, type Page } from "@playwright/test";
import { admin, codeFrom, createUser, uniqueEmail, waitForMail } from "./helpers";

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

test("[R-UI-01] the style is signal by default; each other style is picked in the settings screen and kept by cookie", async ({ page, context }) => {
  const email = uniqueEmail("style");
  await createUser(email);
  await login(page, email);
  await expect(page.locator("html")).toHaveAttribute("data-style", "signal");
  await expect(page.getByRole("button", { name: "revue" })).toHaveCount(0); // no switch on the home page
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  const form = page.getByTestId("style-form");
  await expect(form.getByRole("button", { name: "signal" })).toHaveAttribute("aria-pressed", "true");

  // The button carries the style's French label: "récré" for the slug "recre".
  for (const [style, label] of [["revue", "revue"], ["calme", "calme"], ["recre", "récré"]] as const) {
    await form.getByRole("button", { name: label }).click();
    await expect(page.locator("html")).toHaveAttribute("data-style", style);
    await expect(form.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    expect((await context.cookies()).find((c) => c.name === "style")?.value).toBe(style);
    // The choice outlives the page: a fresh load of another screen keeps it.
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-style", style);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
  }
});

test("[R-UI-01] the capture address has a copy button", async ({ page, context }) => {
  const email = uniqueEmail("copy");
  await createUser(email);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page, email);
  const address = (await page.getByTestId("capture-address").textContent())!.trim();
  // [R-CAP-12] the shared address comes first; the token address stays below as the fallback.
  expect(address).toBe("add@capture.test");
  await expect(page.getByText("Autre adresse (si ton fournisseur bloque)")).toBeVisible();
  await expect(page.getByTestId("capture-address-token")).toHaveText(/^[0-9a-f]{20}@capture\.test$/);
  await page.getByTestId("copy-address").click();
  await expect(page.getByTestId("copy-address")).toHaveText("Copié");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(address);
});

test("[R-ACC-05][R-ACC-06] settings are saved, and invalid values are rejected by the server", async ({ page }) => {
  const email = uniqueEmail("settings");
  const userId = await createUser(email);
  await login(page, email);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("15 min").check();
  await page.getByLabel("Nouvelles cartes par jour (maximum)").fill("8");
  await page.getByText("Paramètres avancés").click(); // retention and timezone live in a closed menu
  await page.getByLabel("Rétention visée").fill("0.85");
  await page.getByLabel("Fuseau horaire").fill("America/Montreal");
  await page.getByLabel("Sam").uncheck();
  await page.getByLabel("Dim").uncheck();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();

  const { data: p } = await admin().from("profile").select("*").eq("user_id", userId).single();
  expect(p).toMatchObject({ daily_minutes: 15, max_new_cards: 8, timezone: "America/Montreal", study_days: [1, 2, 3, 4, 5] });
  expect(Number(p!.desired_retention)).toBe(0.85);

  await page.getByText("Paramètres avancés").click(); // the page reloaded with the menu closed
  // Browser-side limits can be bypassed (min/max attributes); the server must still refuse.
  await page.getByLabel("Rétention visée").evaluate((el: HTMLInputElement) => {
    el.removeAttribute("min");
    el.removeAttribute("max");
    el.value = "0.99";
  });
  await page.getByLabel("Fuseau horaire").fill("Mars/Olympus");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("settings-error")).toContainText("La rétention visée doit être entre 0,80 et 0,95.");
  await expect(page.getByTestId("settings-error")).toContainText("Fuseau horaire inconnu.");
  const { data: after } = await admin().from("profile").select("timezone,desired_retention").eq("user_id", userId).single();
  expect(after).toMatchObject({ timezone: "America/Montreal" });
  expect(Number(after!.desired_retention)).toBe(0.85);
});

test("[R-ACC-01] sign-out and help live in Paramètres, not on the home page", async ({ page }) => {
  const email = uniqueEmail("signout");
  await createUser(email);
  await login(page, email);
  await expect(page.getByRole("button", { name: "Me déconnecter" })).toHaveCount(0);
  await expect(page.getByTestId("help-link")).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByTestId("settings-help-link")).toBeVisible();
  await expect(page.getByTestId("whoami")).toContainText(email);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Me déconnecter" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});

test("[R-ACC-08] Paramètres has its groups in order, and one save stores settings, reminders and language together", async ({ page }) => {
  const email = uniqueEmail("groups");
  const userId = await createUser(email);
  await login(page, email);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  expect(await page.locator("main.settings h2").allInnerTexts()).toEqual(["RÉVISIONS", "RAPPELS PAR E-MAIL", "LANGUE", "APPARENCE", "AIDE", "COMPTE"].map((t) => t));
  await expect(page.getByRole("button", { name: "Enregistrer" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Appliquer" })).toHaveCount(0);

  await page.getByLabel("6 min").check();
  await page.getByLabel("Lun").uncheck();
  await page.getByLabel("En pause une semaine").check();
  await page.getByLabel("English").check();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();

  const { data: p } = await admin().from("profile").select("daily_minutes,study_days,reminders_off,reminders_paused_until,language").eq("user_id", userId).single();
  expect(p).toMatchObject({ daily_minutes: 6, study_days: [2, 3, 4, 5, 6, 0].sort((a, b) => a - b), reminders_off: false, language: "en" });
  expect(new Date(p!.reminders_paused_until as string).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("[R-ACC-08] saving other settings does not renew a running pause", async ({ page }) => {
  const email = uniqueEmail("pause");
  const userId = await createUser(email);
  const pausedUntil = new Date(Date.now() + 3 * 86_400_000).toISOString();
  await admin().from("profile").update({ reminders_paused_until: pausedUntil }).eq("user_id", userId);
  await login(page, email);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("En pause une semaine")).toBeChecked();
  await page.getByLabel("20 min").check();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  const { data } = await admin().from("profile").select("daily_minutes,reminders_paused_until").eq("user_id", userId).single();
  expect(data!.daily_minutes).toBe(20);
  expect(new Date(data!.reminders_paused_until as string).getTime()).toBe(new Date(pausedUntil).getTime());
});

test("[R-ACC-09] the data links and the advanced settings are in closed menus that open from the keyboard", async ({ page }) => {
  const email = uniqueEmail("menus");
  await createUser(email);
  await login(page, email);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  for (const id of ["export-link", "delete-link"]) await expect(page.getByTestId(id)).toBeHidden();
  await expect(page.getByLabel("Fuseau horaire")).toBeHidden();

  await page.getByTestId("data-section").locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("export-link")).toBeVisible();
  await expect(page.getByTestId("delete-link")).toBeVisible();
  await expect(page.getByRole("link", { name: "Confidentialité" })).toBeVisible();

  await page.getByTestId("advanced-section").locator("summary").focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Fuseau horaire")).toBeVisible();
});

test("[R-ACC-08][R-ACC-09] without JavaScript the form still saves and an invalid value reopens the advanced menu", async ({ page, browser }) => {
  const email = uniqueEmail("nojs");
  const userId = await createUser(email);
  await login(page, email);
  const ctx = await browser.newContext({ baseURL: "http://localhost:3100", javaScriptEnabled: false, storageState: await page.context().storageState() });
  const p = await ctx.newPage();
  await p.goto("/settings");
  await p.getByLabel("10 min").check();
  await p.getByLabel("Nouvelles cartes par jour (maximum)").fill("5");
  await p.getByRole("button", { name: "Enregistrer" }).click();
  await expect(p.getByTestId("settings-saved")).toBeVisible();
  expect((await admin().from("profile").select("max_new_cards").eq("user_id", userId).single()).data).toMatchObject({ max_new_cards: 5 });

  await p.getByTestId("advanced-section").locator("summary").click();
  await p.getByLabel("Fuseau horaire").fill("Mars/Olympus");
  await p.getByRole("button", { name: "Enregistrer" }).click();
  await expect(p.getByTestId("settings-error")).toContainText("Fuseau horaire inconnu.");
  await expect(p.getByLabel("Fuseau horaire")).toBeVisible(); // the menu is open again because the error is inside it
  await ctx.close();
});

test("[R-UI-03] at 375 px every pill, menu title and button is at least 44 px tall", async ({ page }) => {
  const email = uniqueEmail("tap");
  await createUser(email);
  await login(page, email);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  const targets = page.locator("main.settings .pill span, main.settings summary, main.settings button, main.settings .group a");
  const n = await targets.count();
  expect(n).toBeGreaterThan(15);
  for (let i = 0; i < n; i++) {
    const box = await targets.nth(i).boundingBox();
    if (!box) continue; // inside a closed menu
    expect(box.height, await targets.nth(i).innerText()).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
