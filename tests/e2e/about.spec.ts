import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { VERIFIED_SOURCES } from "../../src/config/about-sources";
import { ABOUT_SECTIONS } from "../../src/domain/about";
import { codeFrom, createUser, uniqueEmail, waitForMail } from "./helpers";

// Playwright loads this file as a native ES module: read the JSON files instead of importing them.
const read = (lang: "fr" | "en") => JSON.parse(readFileSync(`messages/${lang}.json`, "utf8"));
const fr = read("fr");
const en = read("en");
const BASE = "http://localhost:3100";
const STYLES = ["signal", "revue", "calme", "recre"] as const;

const setCookie = (context: BrowserContext, name: string, value: string) => context.addCookies([{ name, value, url: BASE }]);

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

const sectionTitles = (m: typeof fr) => ABOUT_SECTIONS.map((s) => m.about.sections[s.id].title.replace("{brand}", "Memento"));

test("[R-ABOUT-01] signed out, /about answers 200 with one h1 and the French headings in order; the English cookie gives the English ones", async ({ page, context }) => {
  const res = await page.goto("/about");
  expect(res!.status()).toBe(200);
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText(fr.about.title);
  expect(await page.locator("main h2").allInnerTexts()).toEqual([...sectionTitles(fr), fr.about.limitsTitle, fr.about.sourcesTitle]);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  await setCookie(context, "locale", "en");
  await page.goto("/about");
  await expect(page.locator("h1")).toHaveText(en.about.title);
  expect(await page.locator("main h2").allInnerTexts()).toEqual([...sectionTitles(en), en.about.limitsTitle, en.about.sourcesTitle]);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("[R-ABOUT-01] the page shows the brand and the default retention, and sets no cookie", async ({ page, context }) => {
  await page.goto("/about");
  await expect(page.getByText("Memento repose sur")).toBeVisible();
  await expect(page.getByText("La valeur par défaut est 90")).toBeVisible();
  expect(await context.cookies()).toEqual([]);
});

test("[R-ABOUT-02] the source links on the page are the verified sources' URLs, in order", async ({ page }) => {
  await page.goto("/about");
  const hrefs = await page.getByTestId("about-source-link").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
  expect(hrefs).toEqual(VERIFIED_SOURCES.map((s) => s.url));
  for (const s of VERIFIED_SOURCES) await expect(page.locator(`#src-${s.id}`)).toContainText(s.title.split(" (")[0]!);
  // each "Source :" link under a section points at an entry of the list
  const anchors = await page.locator("main .srcs a").evaluateAll((els) => els.map((e) => e.getAttribute("href")!.slice(1)));
  expect(anchors.length).toBeGreaterThan(0);
  for (const id of anchors) await expect(page.locator(`#${id}`)).toHaveCount(1);
});

test("[R-ABOUT-06] About is linked from the landing footer, Paramètres (Aide) and /help; the nav bar keeps its five links", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("landing-about-link").click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator("h1")).toHaveText(fr.about.title);

  const email = uniqueEmail("about");
  await createUser(email);
  await login(page, email);
  await page.goto("/settings");
  await page.getByTestId("settings-about-link").click();
  await expect(page).toHaveURL(/\/about$/);
  await page.goto("/help");
  await page.getByTestId("help-about").click();
  await expect(page).toHaveURL(/\/about$/);

  for (const path of ["/about", "/settings", "/help"]) {
    await page.goto(path);
    const links = await page.locator("nav.bar a:not(.brand)").allInnerTexts();
    expect(links, path).toEqual([fr.nav.home, fr.nav.tray, fr.nav.review, fr.nav.pages, fr.nav.settings]);
  }
});

for (const style of STYLES) {
  test(`[R-ABOUT-07] at 375 px in ${style}: standalone links are at least 44 px tall, source URLs wrap, no horizontal scroll`, async ({ page, context }) => {
    await setCookie(context, "style", style);
    await page.setViewportSize({ width: 375, height: 812 });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/about");
      const sizes = await page.locator("main a").evaluateAll((els) => els.map((e) => ({ href: e.getAttribute("href"), h: e.getBoundingClientRect().height })));
      expect(sizes.length).toBeGreaterThan(5);
      for (const s of sizes) expect(s.h, `${style} ${scheme}: ${s.href}`).toBeGreaterThanOrEqual(44);
      const width = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: window.innerWidth }));
      expect(width.doc, `${style} ${scheme}`).toBeLessThanOrEqual(width.view);
      const longest = await page.getByTestId("about-source-link").first().evaluate((e) => e.getBoundingClientRect().right);
      expect(longest).toBeLessThanOrEqual(375);
    }
  });
}

test("[R-ABOUT-07] a keyboard focus on a source link is visible", async ({ page }) => {
  await page.goto("/about");
  const link = page.getByTestId("about-source-link").first();
  await link.focus();
  const outline = await link.evaluate((e) => getComputedStyle(e).outlineStyle + " " + getComputedStyle(e).outlineWidth);
  expect(outline).not.toMatch(/^none/);
});

test("[R-ABOUT-08] with JavaScript disabled the page renders fully", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: BASE });
  const page = await context.newPage();
  const res = await page.goto("/about");
  expect(res!.status()).toBe(200);
  await expect(page.locator("h1")).toHaveText(fr.about.title);
  await expect(page.locator("main h2")).toHaveCount(ABOUT_SECTIONS.length + 2);
  await expect(page.getByTestId("about-source-link")).toHaveCount(VERIFIED_SOURCES.length);
  await expect(page.locator("details")).toHaveCount(0);
  await context.close();
});

test("[R-ABOUT-09] the Limites section is visible and not inside a details, in French and English", async ({ page, context }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "Limites" })).toBeVisible();
  expect(await page.getByRole("heading", { name: "Limites" }).evaluate((e) => e.closest("details"))).toBeNull();
  await setCookie(context, "locale", "en");
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "Limits" })).toBeVisible();
  expect(await page.getByRole("heading", { name: "Limits" }).evaluate((e) => e.closest("details"))).toBeNull();
});

for (const [lang, m] of [["fr", fr], ["en", en]] as const) {
  test(`[R-ABOUT-10] ${lang}: every block carries its role as a text label, the number square and top rule use the main role colour`, async ({ page, context }) => {
    if (lang === "en") await setCookie(context, "locale", "en");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/about");
    const label = (role: "theory" | "algorithm" | "memento") => m.about.roles[role].replace("{brand}", "Memento");
    for (const s of ABOUT_SECTIONS) {
      const li = page.getByTestId(`about-${s.id}`);
      const tags = await li.locator(".role-tag").allInnerTexts();
      expect(tags, s.id).toEqual(s.blocks.map(label));
      // the top rule and the number square are in the section's main role colour
      const tokenColour = (role: string) => `--role-${role}`;
      const colours = await li.evaluate((el, token) => {
        const probe = document.createElement("i");
        probe.style.color = `var(${token})`;
        document.body.append(probe);
        const wanted = getComputedStyle(probe).color;
        probe.remove();
        return { wanted, rule: getComputedStyle(el).borderTopColor, square: getComputedStyle(el, "::before").backgroundColor };
      }, tokenColour(s.role));
      expect(colours.rule, s.id).toBe(colours.wanted);
      expect(colours.square, s.id).toBe(colours.wanted);
      // below 48rem the number sits above the heading
      const box = await li.boundingBox();
      const h2 = await li.locator("h2").boundingBox();
      expect(h2!.x - box!.x, s.id).toBeLessThan(2);
    }
    await expect(page.getByText(/légende|legend/i)).toHaveCount(0);
  });
}
