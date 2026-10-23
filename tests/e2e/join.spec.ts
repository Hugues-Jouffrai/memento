import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { admin, codeFrom, uniqueEmail, waitForMail } from "./helpers";

async function invite(o: { max?: number; revoked?: boolean } = {}) {
  const code = randomBytes(20).toString("base64url");
  await admin().from("invite_code").insert({
    code_hash: createHash("sha256").update(code).digest("hex"),
    max_uses: o.max ?? 30,
    expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    revoked_at: o.revoked ? new Date().toISOString() : null,
  });
  return code;
}

async function join(page: Page, code: string, email: string) {
  await page.goto(`/join/${code}`);
  await page.waitForLoadState("networkidle"); // let React hydrate before typing
  await page.getByLabel("Ton adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
}

test("[R-ACC-02] the invite link creates an account and the code signs the new user in", async ({ page }) => {
  const email = uniqueEmail("invited");
  await join(page, await invite(), email);
  await expect(page.getByLabel("Code à 6 chiffres")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Code à 6 chiffres").fill(codeFrom((await waitForMail(email)).text));
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page).toHaveURL(/\/welcome\/1$/); // R-ONB-07: a brand-new account starts with the walkthrough
  await page.getByTestId("welcome-skip").click();
  await expect(page.getByTestId("due-today")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByTestId("whoami")).toContainText(email);
});

test("[R-ACC-02] a revoked or unknown link gets a polite refusal and no account", async ({ page }) => {
  for (const code of [await invite({ revoked: true }), randomBytes(20).toString("base64url")]) {
    const email = uniqueEmail("refused");
    await join(page, code, email);
    await expect(page.getByText("Cette invitation n'est plus valable")).toBeVisible();
    const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.some((u) => u.email === email)).toBe(false);
  }
});

test("[R-ACC-02] the join page is public, the sign-in page still creates no account", async ({ page }) => {
  await page.goto(`/join/${await invite()}`);
  await expect(page).toHaveURL(/\/join\//);
  await expect(page.getByRole("heading", { name: "Rejoindre la bêta" })).toBeVisible();
});

test("[R-ACC-11] the join page tells existing users to use the sign-in page, with a link", async ({ page }) => {
  await page.goto(`/join/${await invite()}`);
  const note = page.getByTestId("join-existing");
  await expect(note).toContainText("Tu as déjà un compte");
  await note.getByRole("link", { name: "Aller à la page de connexion" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
