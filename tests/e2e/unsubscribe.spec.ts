import { expect, test } from "@playwright/test";
import { createUnsubscribeToken } from "../../src/server/review-token";
import { REVIEW_LINK_SECRET, admin, createUser, uniqueEmail } from "./helpers";

const prefOf = async (id: string) => (await admin().from("profile").select("reminders_off,reminders_paused_until").eq("user_id", id).single()).data!;

test("[R-NOT-04] the link in a reminder pauses and resumes without signing in", async ({ page }) => {
  const id = await createUser(uniqueEmail("unsub"));
  await page.goto(`/u/${createUnsubscribeToken(id, REVIEW_LINK_SECRET)}`);
  await page.getByRole("button", { name: "Pause d'une semaine" }).click();
  await expect(page.getByTestId("reminders-saved")).toBeVisible();
  expect((await prefOf(id)).reminders_paused_until).not.toBeNull();
  await page.getByRole("button", { name: "Arrêter les rappels" }).click();
  await expect(page.getByText("Les rappels sont arrêtés.")).toBeVisible();
  expect((await prefOf(id)).reminders_off).toBe(true);
  await page.getByRole("button", { name: "Reprendre les rappels" }).click();
  await expect(page.getByText("Les rappels sont actifs.")).toBeVisible();
  expect(await prefOf(id)).toEqual({ reminders_off: false, reminders_paused_until: null });
});

test("[R-NOT-04] one-click POST turns reminders off, a bad token changes nothing", async ({ request }) => {
  const id = await createUser(uniqueEmail("oneclick"));
  expect((await request.post("/api/unsubscribe/garbage")).status()).toBe(400);
  expect((await prefOf(id)).reminders_off).toBe(false);
  expect((await request.post(`/api/unsubscribe/${createUnsubscribeToken(id, REVIEW_LINK_SECRET)}`)).status()).toBe(200);
  expect((await prefOf(id)).reminders_off).toBe(true);
});

test("[R-NOT-04] a bad link shows a polite message and no choices", async ({ page }) => {
  await page.goto("/u/not-a-token");
  await expect(page.getByText("Ce lien n'est pas valable")).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
});
