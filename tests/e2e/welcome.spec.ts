import { expect, test, type Page } from "@playwright/test";
import { admin, codeFrom, createUser, uniqueEmail, waitForMail } from "./helpers";

const BASE = "http://localhost:3100";

/** Signs in with the code; returns where the app sent us (the walkthrough for a new account, else the home page). */
async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle"); // let React hydrate before typing
  await page.getByLabel("Ton adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  const code = codeFrom((await waitForMail(email)).text);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Code à 6 chiffres").fill(code);
  await page.getByRole("button", { name: "Me connecter" }).click();
}

const doneAt = async (userId: string) =>
  (await admin().from("profile").select("welcome_done_at").eq("user_id", userId).single()).data?.welcome_done_at as string | null;

test("[R-ONB-07] a new account lands on the walkthrough, no other page redirects, and Skip is remembered", async ({ page, browser }) => {
  const email = uniqueEmail("welcome");
  const userId = await createUser(email, { welcome: true });
  await signIn(page, email);
  await expect(page).toHaveURL(/\/welcome\/1$/);
  await expect(page.getByTestId("welcome")).toBeVisible();

  await page.goto("/tray"); // a deep link is never redirected
  await expect(page).toHaveURL(/\/tray$/);
  await page.goto("/welcome/3");
  await page.getByTestId("welcome-skip").click();
  await expect(page.getByTestId("due-today")).toBeVisible();
  expect(await doneAt(userId)).not.toBeNull();

  // "on every device": a second browser context of the same account goes straight to the home page.
  const second = await browser.newContext({ baseURL: BASE, storageState: await page.context().storageState() });
  const other = await second.newPage();
  await other.goto("/");
  await expect(other.getByTestId("due-today")).toBeVisible();
  await second.close();
});

test("[R-ONB-07] an interrupted visit is offered again", async ({ page }) => {
  const email = uniqueEmail("welcome-again");
  const userId = await createUser(email, { welcome: true });
  await signIn(page, email);
  await expect(page).toHaveURL(/\/welcome\/1$/);
  await page.goto("/welcome/2"); // wanders off without skipping
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome\/1$/);
  expect(await doneAt(userId)).toBeNull();
});

test("[R-ONB-08] five screens walk with Next and Back, work without JavaScript, and Finish stores the flag", async ({ page, browser }) => {
  const email = uniqueEmail("welcome-walk");
  const userId = await createUser(email, { welcome: true });
  await signIn(page, email);
  await expect(page).toHaveURL(/\/welcome\/1$/);

  const ctx = await browser.newContext({ baseURL: BASE, javaScriptEnabled: false, storageState: await page.context().storageState() });
  const p = await ctx.newPage();
  await p.goto("/welcome");
  await expect(p).toHaveURL(/\/welcome\/1$/);
  await expect(p.getByTestId("welcome-back")).toHaveCount(0);
  const titles: string[] = [];
  for (let step = 1; step <= 5; step++) {
    await expect(p.getByTestId("welcome-progress")).toHaveText(`Étape ${step} sur 5`);
    await expect(p.getByRole("heading", { level: 1 })).toHaveCount(1);
    titles.push(await p.getByRole("heading", { level: 1 }).innerText());
    if (step < 5) await p.getByTestId("welcome-next").click();
  }
  expect(titles).toEqual(["Pour commencer", "Envoyer une note", "Valider les cartes", "Les révisions et le rappel", "À toi d'essayer"]);
  await expect(p.getByTestId("welcome-next")).toHaveCount(0);
  await expect(p.getByTestId("welcome-skip")).toHaveCount(0);
  await expect(p.getByTestId("welcome-try")).toHaveAttribute("href", /^mailto:add@capture\.test\?subject=/);
  await p.getByTestId("welcome-back").click();
  await expect(p).toHaveURL(/\/welcome\/4$/);

  await p.goto("/welcome/2"); // the address comes with the help text of /help
  await expect(p.getByTestId("welcome-address")).toHaveText("add@capture.test");
  expect(await doneAt(userId)).toBeNull();

  await p.goto("/welcome/5");
  await p.getByTestId("welcome-finish").click();
  await expect(p.getByTestId("due-today")).toBeVisible();
  expect(await doneAt(userId)).not.toBeNull();
  await ctx.close();
});

test("[R-ONB-08] unknown steps are 404 and a signed-out visitor goes to login", async ({ page }) => {
  const email = uniqueEmail("welcome-404");
  await createUser(email);
  await page.goto("/welcome/1");
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, email);
  await expect(page.getByTestId("due-today")).toBeVisible();
  for (const step of ["0", "6", "x", "01"]) expect((await page.goto(`/welcome/${step}`))?.status()).toBe(404);
});

test("[R-ONB-09] the replay links open the first screen and a replay never changes the stored date", async ({ page }) => {
  const email = uniqueEmail("welcome-replay");
  const userId = await createUser(email);
  const before = await doneAt(userId);
  expect(before).not.toBeNull();
  await signIn(page, email);
  await expect(page.getByTestId("due-today")).toBeVisible();

  await page.goto("/settings");
  await page.getByTestId("settings-replay-link").click();
  await expect(page).toHaveURL(/\/welcome\/1$/);
  await page.goto("/help");
  await page.getByTestId("help-replay").click();
  await expect(page).toHaveURL(/\/welcome\/1$/);

  await page.goto("/welcome/5");
  await page.getByTestId("welcome-finish").click();
  await expect(page.getByTestId("due-today")).toBeVisible();
  expect(await doneAt(userId)).toBe(before);
});
