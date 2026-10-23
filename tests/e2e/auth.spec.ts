import { expect, test, type Page } from "@playwright/test";
import { admin, anon, codeFrom, createUser, uniqueEmail, waitForMail } from "./helpers";

async function requestCode(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle"); // let React hydrate before typing
  await page.getByLabel("Ton adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  await expect(page.getByLabel("Code à 6 chiffres")).toBeVisible();
  await page.waitForLoadState("networkidle"); // let React hydrate before typing
}

test("[R-ACC-01] [R-LAND-01] a signed-out visitor of a private screen is sent to the login page", async ({ page }) => {
  await page.goto("/tray");
  await expect(page).toHaveURL(/\/login$/);
});

test("[R-ACC-01] the 6-digit code signs the user in, and is single use", async ({ page }) => {
  const email = uniqueEmail("code");
  await createUser(email);
  await requestCode(page, email);
  const code = codeFrom((await waitForMail(email)).text);

  await page.getByLabel("Code à 6 chiffres").fill(code);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByTestId("due-today")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByTestId("whoami")).toContainText(email);

  // Single use: replaying the same code against Auth is refused.
  const { error } = await anon().auth.verifyOtp({ email, token: code, type: "email" });
  expect(error).not.toBeNull();
});

test("[R-ACC-01] a wrong code is refused with a message", async ({ page }) => {
  const email = uniqueEmail("wrong");
  await createUser(email);
  await requestCode(page, email);
  await page.getByLabel("Code à 6 chiffres").fill("000000");
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByText("Code incorrect ou expiré")).toBeVisible();
});

test("[R-ACC-01] the sign-in mail holds the code and no token link, so a scanner that opens its links uses up nothing", async ({ page }) => {
  const email = uniqueEmail("nolink");
  await createUser(email);
  await requestCode(page, email);
  const { text } = await waitForMail(email);
  expect(codeFrom(text)).toMatch(/^\d{6}$/);
  expect(text).not.toMatch(/auth\/v1\/verify|token=|token_hash|code=/);
  // Whatever a scanner opens (every link in the mail), the code still signs in.
  for (const url of text.match(/https?:\/\/\S+/g) ?? []) await fetch(url.replace(/[)>\]]+$/, ""), { redirect: "manual" });
  await page.getByLabel("Code à 6 chiffres").fill(codeFrom(text));
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByTestId("due-today")).toBeVisible();
});

test("[D28] an unknown address gets the same answer and no account is created", async ({ page }) => {
  const email = uniqueEmail("stranger");
  await requestCode(page, email);
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
  expect(data.users.some((u) => u.email === email)).toBe(false);
});

test("[R-ACC-01] an old link that was already used says so and offers a new code, not a dead one", async ({ page }) => {
  await page.goto("/auth/callback?code=not-a-valid-code");
  await expect(page).toHaveURL(/\/login\?error=link$/);
  await expect(page.getByText("Ce lien a déjà servi ou a expiré")).toBeVisible();
  await expect(page.getByLabel("Code à 6 chiffres")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recevoir un code" })).toBeVisible();
});

test("[R-ACC-01] after a wrong code the page offers a new code and says only the latest mail counts", async ({ page }) => {
  const email = uniqueEmail("newcode");
  await createUser(email);
  await requestCode(page, email);
  await page.getByLabel("Code à 6 chiffres").fill("000000");
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Seul le code du dernier e-mail reçu fonctionne");
  await expect(page.getByTestId("new-code-wait")).toBeVisible(); // D60: the new-code action is offered once the resend wait is over
});

test("[R-ACC-01] a code typed in another browser or tab (no pending address) asks for address and code, and signs in", async ({ page }) => {
  const email = uniqueEmail("elsewhere");
  await createUser(email);
  // The code is requested by something that is not this browser.
  await anon().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  const code = codeFrom((await waitForMail(email)).text);
  await page.goto("/login?step=code");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Saisis ton adresse et le code du dernier e-mail reçu")).toBeVisible();
  await page.getByLabel("Ton adresse e-mail").fill(email);
  await page.getByLabel("Code à 6 chiffres").fill(code);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByTestId("due-today")).toBeVisible();
});

test("[R-ACC-01] the address-and-code form refuses a wrong code", async ({ page }) => {
  await page.goto("/login?step=code");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Ton adresse e-mail").fill(uniqueEmail("nobody"));
  await page.getByLabel("Code à 6 chiffres").fill("000000");
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByText("Code incorrect ou expiré")).toBeVisible();
});

test("[R-ACC-10] after a code is sent the new-code action waits with a visible countdown", async ({ page }) => {
  const email = uniqueEmail("wait");
  await createUser(email);
  await requestCode(page, email);
  const wait = page.getByTestId("new-code-wait");
  await expect(wait).toHaveText(/dans \d+ secondes?/);
  await expect(page.getByTestId("new-code-link")).toHaveCount(0);
  const first = Number((await wait.textContent())?.match(/\d+/)?.[0]);
  await expect.poll(async () => Number((await wait.textContent())?.match(/\d+/)?.[0]), { timeout: 5000 }).toBeLessThan(first);
});

test("[R-ACC-10] a second request within the resend limit says how many seconds to wait", async ({ page }) => {
  const email = uniqueEmail("limit");
  await createUser(email);
  await requestCode(page, email);
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Ton adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  await expect(page.getByText(/Trop de demandes\. Réessaie dans \d+ secondes?\./)).toBeVisible();
});

