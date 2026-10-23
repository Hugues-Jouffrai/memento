import { expect, test } from "@playwright/test";

test("[M0] /api/health answers ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });
});

test("[R-ACC-03] the login page is in French by default", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Connexion");
});

test("[R-ACC-03] the locale cookie switches the login page to English", async ({ page, context }) => {
  await context.addCookies([{ name: "locale", value: "en", url: "http://localhost:3100" }]);
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sign in");
});

test("[R-SEC-02] /api/worker refuses calls without a valid secret, including when the secret is unset", async ({ request }) => {
  const attempts: Record<string, string>[] = [{}, { authorization: "Bearer " }, { authorization: "Bearer wrong" }];
  for (const headers of attempts) {
    const res = await request.post("/api/worker", { headers });
    expect(res.status()).toBe(401);
  }
});

test("[R-SEC-02] /api/inbound/resend refuses unsigned and mis-signed requests", async ({ request }) => {
  const body = JSON.stringify({ type: "email.received", data: { email_id: "x" } });
  const unsigned = await request.post("/api/inbound/resend", { data: body });
  expect(unsigned.status()).toBe(401);
  const forged = await request.post("/api/inbound/resend", {
    data: body,
    headers: { "svix-id": "msg_1", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,AAAA" },
  });
  expect(forged.status()).toBe(401);
});

test("[R-UI-01] the tab icons are served to signed-out visitors", async ({ request }) => {
  for (const [path, type] of [["/icon.png", "image/png"], ["/icon.svg", "image/svg+xml"], ["/apple-icon.png", "image/png"], ["/favicon.ico", "image/x-icon"]] as const) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect([path, res.status()]).toEqual([path, 200]);
    expect(res.headers()["content-type"]).toContain(type.split("/")[1]!.split("+")[0]!);
  }
});

test("[R-UI-01] the login page points to the icons", async ({ request }) => {
  const html = await (await request.get("/login")).text();
  expect(html).toMatch(/<link rel="icon"[^>]*href="\/icon\.png/);
  expect(html).toMatch(/<link rel="apple-touch-icon"[^>]*href="\/apple-icon\.png/);
});
