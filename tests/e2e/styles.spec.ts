import { expect, test, type Page } from "@playwright/test";
import { codeFrom, createUser, seedProposedCards, uniqueEmail, waitForMail } from "./helpers";

/** The two newer styles (D68) on the screens people use every day, at phone width, light and dark. */

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

for (const style of ["calme", "recre"] as const) {
  test(`[R-UI-02] [R-UI-03] at 375 px in ${style}: buttons and standalone links are 44 px tall, the nav fits one line, nothing scrolls sideways`, async ({ page, context }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail(`style-${style}`);
    const userId = await createUser(email);
    await seedProposedCards(userId, 3, "Les abeilles");
    await login(page, email);
    await page.goto("/tray");
    await page.getByRole("button", { name: "Tout garder" }).click();
    await expect(page.getByTestId("tray-card")).toHaveCount(0);
    const topic = await seedProposedCards(userId, 3, "Teotihuacan, une cité sans histoire écrite");
    await context.addCookies([{ name: "style", value: style, url: new URL(page.url()).origin }]);
    await page.setViewportSize({ width: 375, height: 812 });

    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const url of ["/", "/tray", "/review", `/pages/${topic.pageId}`, "/pages", "/settings"]) {
        await page.goto(url);
        await page.waitForLoadState("networkidle");
        await expect(page.locator("html")).toHaveAttribute("data-style", style);
        const where = `${style} ${scheme} ${url.replace(/[0-9a-f-]{36}/, ":id")}`;
        // Buttons, pills and links that stand alone (a link inside a sentence is the documented exception, WCAG 2.5.8).
        const targets = page.locator("main button:visible, main .btn:visible, main .pill span:visible, main summary:visible, .bar a:visible, main .index a:visible, main .related-list a:visible, main .back:visible");
        const n = await targets.count();
        for (let i = 0; i < n; i++) {
          const box = await targets.nth(i).boundingBox();
          if (!box) continue;
          expect(box.height, `${where}: ${(await targets.nth(i).innerText()).trim().slice(0, 30)}`).toBeGreaterThanOrEqual(44);
        }
        // Each French nav label stays on one line (Lexend is wide: "À valider" and "Paramètres" are the long ones).
        const links = page.locator(".bar a:not(.brand)");
        const lines = await links.evaluateAll((els) =>
          els.map((e) => {
            const range = document.createRange();
            range.selectNodeContents(e);
            return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
          }),
        );
        expect(lines, `${where}: nav labels wrap`).toEqual([1, 1, 1, 1, 1]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${where}: scrolls sideways`).toBe(true);
      }
      // The review screen after revealing the answer: the four grades are all there and 44 px tall.
      await page.goto("/review");
      await page.getByTestId("show-answer").click();
      await expect(page.getByTestId("answer")).toBeVisible();
      const grades = page.locator(".grade");
      expect(await grades.count()).toBe(4);
      for (let i = 0; i < 4; i++) expect((await grades.nth(i).boundingBox())!.height, `${style} ${scheme}: grade ${i + 1}`).toBeGreaterThanOrEqual(44);
    }
  });
}
