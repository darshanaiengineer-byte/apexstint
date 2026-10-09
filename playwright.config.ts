import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the PRODUCTION build (`next start`), not the dev server,
 * so they exercise what would actually be deployed. Build first: `npm run build`
 * (or use `npm run test:e2e`, which builds and then tests).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
