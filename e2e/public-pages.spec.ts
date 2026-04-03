import { test, expect } from "@playwright/test";

test("hjemmeside laster og viser trafikkdata", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Moss/i);
  await expect(page.getByRole("heading", { name: /Er det smart å kjøre nå/i })).toBeVisible();
});

test("/om laster", async ({ page }) => {
  await page.goto("/om");
  await expect(page).toHaveURL(/\/om/);
  await expect(page.locator("h1")).toBeVisible();
});

test("/api/traffic/live returnerer 200 med stations-felt", async ({ request }) => {
  const response = await request.get("/api/traffic/live");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("stations");
  expect(Array.isArray(body.stations)).toBe(true);
});
