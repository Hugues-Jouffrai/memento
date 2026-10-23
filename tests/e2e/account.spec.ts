import { expect, test, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
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

test("[R-SEC-05] the privacy page is public and lists the processors", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Confidentialité", level: 1 })).toBeVisible();
  for (const name of ["Google", "Supabase", "Resend", "Vercel", "Cloudflare"]) await expect(page.getByText(name).first()).toBeVisible();
});

test("[R-SEC-06] a signed-in user downloads their data as a zip; signed out gets nothing", async ({ page, request }) => {
  expect((await request.get("/settings/export", { maxRedirects: 0 })).status()).not.toBe(200);
  const email = uniqueEmail("export");
  const id = await createUser(email);
  await seedProposedCards(id, 2);
  await login(page, email);
  const res = await page.request.get("/settings/export");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/zip");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const files = unzipSync(new Uint8Array(await res.body()));
  expect(Object.keys(files)).toContain("cards.csv");
  expect(strFromU8(files["cards.csv"]!)).toContain("Question 1 sur la danse ?");
});

test("[R-SEC-06] deleting the account needs the typed address, then erases everything", async ({ page }) => {
  const email = uniqueEmail("gone");
  const id = await createUser(email);
  await seedProposedCards(id, 1);
  await login(page, email);
  await page.goto("/settings/delete");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Pour confirmer, saisis ton adresse e-mail").fill("someone-else@example.test");
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.getByText("Cette adresse ne correspond pas")).toBeVisible();
  expect((await admin().auth.admin.getUserById(id)).data.user).not.toBeNull();

  await page.getByLabel("Pour confirmer, saisis ton adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.getByTestId("account-deleted")).toBeVisible();
  expect((await admin().auth.admin.getUserById(id)).data.user).toBeNull();
  expect(Number((await admin().rpc("user_rows_count", { p_user_id: id })).data)).toBe(0);
  await page.goto("/tray");
  await expect(page).toHaveURL(/\/login$/);
});
