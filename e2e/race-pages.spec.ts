import { expect, test } from "@playwright/test";

/** Navigation, error states and hover interactions on the read-only pages and charts. */

test("home → race overview → strategy lab", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Bahrain Grand Prix" }).click();
  await expect(page).toHaveURL("/races/2024-01-bahrain");
  await expect(page.getByRole("heading", { level: 1, name: "Bahrain Grand Prix" })).toBeVisible();
  await page.getByRole("link", { name: "Strategy lab" }).click();
  await expect(page).toHaveURL("/races/2024-01-bahrain/strategy");
  await expect(page.locator('section[aria-label^="Strategy "]')).toHaveCount(3);
});

test("unknown race returns 404 with a way back", async ({ page }) => {
  const res = await page.goto("/races/1999-99-nowhere");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Nothing on this lap")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to races" })).toBeVisible();
});

test("slow real stops and red-flag stoppages are labelled differently", async ({ page }) => {
  await page.goto("/races/2024-01-bahrain");
  await expect(page.getByText("1:14.773 · long stop")).toBeVisible();
  await expect(page.getByText(/· red-flag stoppage/)).toHaveCount(0);
  await page.goto("/races/2024-04-japan");
  await expect(page.getByText(/· red-flag stoppage/)).toHaveCount(18);
});

test("stint timeline shows details on hover", async ({ page }) => {
  await page.goto("/races/2024-01-bahrain");
  await page.getByRole("button", { name: "VER stint 1: Soft, laps 1 to 17" }).hover();
  const readout = page.locator('[aria-live="polite"]');
  await expect(readout).toContainText("Stint 1 · laps 1–17 (17 laps)");
  await expect(readout).toContainText("Tyre age at fit: 3");
});

test("lap-time chart tooltip shows recorded lap times on hover", async ({ page }) => {
  await page.goto("/races/2024-01-bahrain");
  const chart = page.getByRole("img", { name: "Recorded lap times for VER, PER, SAI" });
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.locator(".recharts-surface").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  const tooltip = chart.locator(".recharts-tooltip-wrapper");
  await expect(tooltip).toContainText(/Lap \d+/);
  for (const code of ["VER", "PER", "SAI"]) await expect(tooltip).toContainText(code);
  await expect(tooltip).toContainText(/1:3\d\.\d{3}/);
});

test("strategy gap chart tooltip shows the gap per strategy on hover", async ({ page }) => {
  await page.goto("/races/2024-01-bahrain/strategy");
  const chart = page.getByRole("img", { name: "Cumulative gap to the fastest strategy by lap" });
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.locator(".recharts-surface").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  const tooltip = chart.locator(".recharts-tooltip-wrapper");
  await expect(tooltip).toContainText(/After lap \d+/);
  await expect(tooltip).toContainText("1-stop M–H");
  await expect(tooltip).toContainText("VER as raced");
});

test("theme toggle switches to light and back", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Switch to dark charcoal theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
