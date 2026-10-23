import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { BRAND } from "../../src/config/brand";
import { WAITLIST_RETENTION_MONTHS } from "../../src/domain/waitlist";
import { sealWaitlistToken } from "../../src/server/waitlist-token";
import { REVIEW_LINK_SECRET, admin, codeFrom, createUser, uniqueEmail, waitForMail } from "./helpers";

// Playwright loads this file as a native ES module, where a bare JSON import needs an attribute: read the files instead.
const read = (lang: "fr" | "en") => JSON.parse(readFileSync(`messages/${lang}.json`, "utf8"));
const fr = read("fr");
const en = read("en");

const links = (text: string) => text.match(/https?:\/\/\S+/g) ?? [];
/** Mail links point at APP_URL's default (localhost:3000), not the test server: navigate by pathname. */
const pathOf = (text: string, kind: "confirm" | "leave") => new URL(links(text).find((l) => l.includes(`/notify/${kind}/`))!).pathname;
const rows = async (email: string) => (await admin().from("waitlist").select("*").eq("email", email)).data ?? [];

async function subscribe(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Ton adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Me prévenir" }).click();
}

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

test.beforeEach(async () => {
  await admin().from("rate_hit").delete().like("key", "waitlist:%");
});

test("[R-LAND-01] signed out: / shows the landing, private screens still go to /login, /privacy and /login render", async ({ page }) => {
  const res = await page.goto("/");
  expect(res!.status()).toBe(200);
  await expect(page.getByTestId("landing")).toBeVisible();
  await expect(page.locator("h1")).toHaveText(fr.app.tagline);
  await page.goto("/tray");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/privacy");
  await expect(page.locator("h1")).toHaveText(fr.privacy.title);
  await page.goto("/login");
  await expect(page.locator("h1")).toBeVisible();
});

test("[R-LAND-01] signed in: / is the home page, not the landing", async ({ page }) => {
  const email = uniqueEmail("landing-in");
  await createUser(email);
  await login(page, email);
  await page.goto("/");
  await expect(page.getByTestId("due-today")).toBeVisible();
  await expect(page.getByTestId("landing")).toHaveCount(0);
});

test("[R-LAND-02] the sections come in order: hook, notify form, three steps, four differences, beta, footer", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main h1, main h2")).toHaveText([fr.app.tagline, fr.landing.notify.title, fr.landing.steps.title, fr.landing.diff.title, fr.landing.beta.title]);
  await expect(page.locator("main ol.steps > li")).toHaveCount(3);
  await expect(page.locator("main ul.diff > li")).toHaveCount(4);
  const foot = page.locator("footer.landing-foot");
  await expect(foot.locator('a[href="/login"]')).toBeVisible();
  await expect(foot.locator('a[href="/privacy"]')).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("[R-LAND-03] [R-LAND-04] ask, get the mail, nothing stored until the button is pressed", async ({ page }) => {
    const email = uniqueEmail("nojs");
    await subscribe(page, email);
    await expect(page).toHaveURL(/\/\?notify=sent$/);
    await expect(page.getByTestId("notify-status")).toContainText("C'est presque fait");
    const mail = await waitForMail(email);
    expect(mail.subject).toContain("Confirme ton adresse");
    expect(await rows(email)).toHaveLength(0);

    await page.goto(pathOf(mail.text, "confirm"));
    await expect(page.getByText(email)).toBeVisible();
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByTestId("waitlist-done")).toBeVisible();
    const stored = await rows(email);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.locale).toBe("fr");
  });
});

test("[R-LAND-03] a listed and a new address get the same answer and the same subject", async ({ page }) => {
  const a = uniqueEmail("listed");
  const b = uniqueEmail("fresh");
  await admin().from("waitlist").insert({ email: a, locale: "fr" });
  await subscribe(page, a);
  const statusA = await page.getByTestId("notify-status").innerText();
  await subscribe(page, b);
  const statusB = await page.getByTestId("notify-status").innerText();
  expect(statusA).toBe(statusB);
  expect((await waitForMail(a)).subject).toBe((await waitForMail(b)).subject);
});

test("[R-LAND-03] a filled honeypot looks like success and sends nothing", async ({ page }) => {
  const email = uniqueEmail("bot");
  await page.goto("/");
  await page.locator('input[name="hp_note"]').fill("bot", { force: true });
  await page.getByLabel("Ton adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Me prévenir" }).click();
  await expect(page.getByTestId("notify-status")).toContainText("C'est presque fait");
  await expect(waitForMail(email, 3000)).rejects.toThrow();
});

test("[R-LAND-06] the fourth request for one address is limited", async ({ page }) => {
  const email = uniqueEmail("limit");
  for (let i = 0; i < 4; i++) await subscribe(page, email);
  await expect(page.getByTestId("notify-status")).toContainText("Trop de demandes pour le moment");
});

test("[R-LAND-07] confirm from the mail, then the mail's leave link removes the address", async ({ page }) => {
  const email = uniqueEmail("leave");
  await subscribe(page, email);
  const mail = await waitForMail(email);
  await page.goto(pathOf(mail.text, "confirm"));
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByTestId("waitlist-done")).toBeVisible();
  expect(await rows(email)).toHaveLength(1);

  await page.goto(pathOf(mail.text, "leave"));
  await page.getByRole("button", { name: "Me retirer" }).click();
  await expect(page.getByTestId("waitlist-done")).toBeVisible();
  expect(await rows(email)).toHaveLength(0);
});

test("[R-LAND-04] garbage, expired and wrong-purpose links show a message and no button", async ({ page }) => {
  const old = sealWaitlistToken("confirm", uniqueEmail("old"), "fr", REVIEW_LINK_SECRET, 3 * 86_400, Math.floor(Date.now() / 1000) - 4 * 86_400);
  const leave = sealWaitlistToken("leave", uniqueEmail("wrong"), "fr", REVIEW_LINK_SECRET, 86_400);
  for (const path of ["/notify/confirm/garbage", `/notify/confirm/${old}`, `/notify/confirm/${leave}`]) {
    await page.goto(path);
    await expect(page.getByTestId("waitlist-invalid")).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(0);
  }
});

test("[R-LAND-10] an anonymous visit sets no cookie and loads nothing from another host; the language switch sets only the locale cookie", async ({ request, page, context }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  expect(res.headers()["set-cookie"]).toBeUndefined();
  const html = await res.text();
  const hosts = [...html.matchAll(/(?:src|href)="(?:https?:)?\/\/([^/"]+)/g)].map((m) => m[1]);
  for (const h of hosts) expect(["localhost:3100", "localhost:3000"]).toContain(h);

  await page.goto("/");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1")).toHaveText(en.app.tagline);
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "locale")?.value).toBe("en");
});

test("[R-LAND-11] at 375 px every control is 44 px tall; the keyboard goes to the email field, then the button, never the honeypot", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const controls = [
    page.getByLabel("Ton adresse e-mail"),
    page.getByRole("button", { name: "Me prévenir" }),
    page.getByRole("link", { name: "J'ai déjà un compte" }),
    page.getByRole("link", { name: fr.landing.beta.privacyLink }),
    page.locator("footer.landing-foot").getByRole("link", { name: fr.login.title }),
    page.locator("footer.landing-foot").getByRole("link", { name: fr.account.privacyLink }),
    page.getByRole("button", { name: "English" }),
  ];
  for (const c of controls) {
    const box = await c.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).name)).toBe("email");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => (document.activeElement as HTMLButtonElement).textContent)).toBe(fr.landing.notify.submit);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).name)).not.toBe("hp_note");
  }
});

test("[R-LAND-12] link-preview tags and noindex", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(new RegExp(BRAND.name));
  expect(await page.title()).toContain(fr.app.tagline);
  const meta = (sel: string) => page.locator(sel).getAttribute("content");
  expect((await meta('meta[name="description"]'))!.length).toBeGreaterThan(0);
  expect(await meta('meta[property="og:title"]')).toContain(fr.app.tagline);
  expect((await meta('meta[property="og:description"]'))!.length).toBeGreaterThan(0);
  expect(await meta('meta[property="og:type"]')).toBe("website");
  expect(await meta('meta[property="og:image"]')).toMatch(/\/icon\.png$/);
  expect(await meta('meta[name="twitter:card"]')).toBe("summary");
  expect(await meta('meta[name="robots"]')).toContain("noindex");
});

test("[R-LAND-09] /privacy has the waiting-list section with the retention", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByTestId("privacy-waitlist")).toBeVisible();
  await expect(page.locator("main")).toContainText(`${WAITLIST_RETENTION_MONTHS} mois`);
});
