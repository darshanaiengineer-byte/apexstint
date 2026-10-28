import { expect, test, type Page } from "@playwright/test";

/**
 * Content-Security-Policy checks against the production server (`next start`).
 * Every test records CSP violations, console errors and uncaught page errors from before the
 * first script runs, and fails on any of them — a policy that silently breaks the app fails here.
 */

interface Problems {
  violations: string[];
  consoleErrors: string[];
  pageErrors: string[];
}

async function watch(page: Page, opts: { allowDocumentStatusError?: boolean } = {}): Promise<() => Promise<Problems>> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // Only the 404 test tolerates the browser's report of the *document's own* 404 status.
    if (opts.allowDocumentStatusError && m.location().url === page.url() && /status of 404/.test(m.text())) return;
    consoleErrors.push(`${m.text()} @ ${m.location().url}`);
  });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(`${e.effectiveDirective} blocked ${e.blockedURI || "inline"} (${e.sourceFile}:${e.lineNumber})`),
    );
  });
  return async () => ({
    violations: await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp),
    consoleErrors,
    pageErrors,
  });
}

const clean: Problems = { violations: [], consoleErrors: [], pageErrors: [] };
const ROUTES = ["/", "/races/2024-01-bahrain", "/races/2024-04-japan", "/races/2024-16-italy", "/races/2024-01-bahrain/strategy", "/data", "/methodology"];

test.describe("Content-Security-Policy", () => {
  for (const route of ROUTES) {
    test(`${route} loads and hydrates with no CSP violations`, async ({ page }) => {
      const problems = await watch(page);
      const res = await page.goto(route, { waitUntil: "networkidle" });
      expect(res?.status()).toBe(200);
      const csp = res?.headers()["content-security-policy"] ?? "";
      expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
      // Hydrated: the theme script ran and the client-rendered toggle is interactive.
      await expect(page.locator("html")).toHaveClass(/dark/);
      await page.getByRole("button", { name: "Switch to light theme" }).click();
      await expect(page.locator("html")).not.toHaveClass(/dark/);
      expect(await problems()).toEqual(clean);
    });
  }

  test("404 page is served with the policy and no violations", async ({ page }) => {
    const problems = await watch(page, { allowDocumentStatusError: true });
    const res = await page.goto("/races/1999-99-nowhere", { waitUntil: "networkidle" });
    expect(res?.status()).toBe(404);
    expect(res?.headers()["content-security-policy"]).toContain("'strict-dynamic'");
    await expect(page.getByText("Nothing on this lap")).toBeVisible();
    expect(await problems()).toEqual(clean);
  });

  test("every script carries this response's nonce, and nonces differ per response", async ({ page, request }) => {
    const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];
    const res = await page.goto("/races/2024-01-bahrain", { waitUntil: "networkidle" });
    const nonce = nonceOf(res!.headers()["content-security-policy"]);
    expect(nonce).toBeTruthy();
    const scripts = (await res!.text()).match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
    const again = await request.get("/races/2024-01-bahrain");
    expect(nonceOf(again.headers()["content-security-policy"])).not.toBe(nonce);
    expect(again.headers()["cache-control"]).toMatch(/no-store/);
  });

  test("a client-supplied x-nonce header is ignored", async ({ request }) => {
    const res = await request.get("/", { headers: { "x-nonce": "attackerchosennonce0000" } });
    expect(res.headers()["content-security-policy"]).not.toContain("attackerchosennonce0000");
    expect(await res.text()).not.toContain("attackerchosennonce0000");
  });

  // Regression: the proxy's asset exclusions were unanchored with unescaped dots, so look-alike
  // paths (/icon.svgx, /_next/staticfoo, …) returned the HTML 404 page without a CSP.
  test("every HTML response carries the policy, including look-alikes of excluded asset paths", async ({ request }) => {
    const paths = ["/favicon.icox", "/faviconXico", "/favicon.ico/extra", "/icon.svgx", "/iconXsvg", "/icon.svg/abc", "/_next/staticfoo", "/_next/imagex", "/no-such-page", "/races/nope"];
    for (const path of paths) {
      const res = await request.get(path);
      expect(res.headers()["content-type"], path).toContain("text/html");
      expect(res.headers()["content-security-policy"], path).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    }
    // Genuine static assets remain excluded (no HTML, no per-request nonce work).
    for (const path of ["/favicon.ico", "/icon.svg"]) {
      const res = await request.get(path);
      expect(res.headers()["content-type"], path).not.toContain("text/html");
      expect(res.headers()["content-security-policy"], path).toBeUndefined();
    }
  });

  // Regression: prefetch-flagged document requests used to skip the proxy, returning HTML with no
  // CSP and letting client-supplied nonce headers reach rendering.
  const prefetchHeaders: Record<string, string>[] = [{ purpose: "prefetch" }, { "next-router-prefetch": "1" }];
  for (const prefetchHeader of prefetchHeaders) {
    test(`a prefetch-flagged document request (${Object.keys(prefetchHeader)[0]}) still gets the policy and ignores client nonces`, async ({ request }) => {
      const attacker = "AttackerNonce0000000000";
      const res = await request.get("/races/2024-01-bahrain", {
        headers: { ...prefetchHeader, "x-nonce": attacker, "content-security-policy": `script-src 'nonce-${attacker}'` },
      });
      expect(res.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
      expect(res.headers()["content-security-policy"]).not.toContain(attacker);
      expect(await res.text()).not.toContain(attacker);
    });
  }

  test("client-side navigation, lab editing, charts and share links work under the policy", async ({ page, browser }) => {
    const problems = await watch(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Bahrain Grand Prix" }).click();
    await expect(page).toHaveURL("/races/2024-01-bahrain");
    await page.getByRole("button", { name: "VER stint 1: Soft, laps 1 to 17" }).hover();
    await expect(page.locator('[aria-live="polite"]')).toContainText("Stint 1 · laps 1–17");
    await page.getByRole("link", { name: "Strategy lab" }).click();
    await expect(page).toHaveURL("/races/2024-01-bahrain/strategy");

    const stop = page.locator('section[aria-label^="Strategy "]').nth(0).getByLabel("Stop 2 lap");
    await stop.click();
    await stop.press("ControlOrMeta+a");
    await stop.pressSequentially("40");
    await stop.press("Enter");
    await expect(stop).toHaveValue("40");
    await expect(page).toHaveURL(/cfg=/);

    const chart = page.getByRole("img", { name: "Cumulative gap to the fastest strategy by lap" });
    await chart.scrollIntoViewIfNeeded();
    const box = (await chart.locator(".recharts-surface").boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await expect(chart.locator(".recharts-tooltip-wrapper")).toContainText(/After lap \d+/);
    expect(await problems()).toEqual(clean);

    // The shared link opens cleanly in a fresh page under its own nonce.
    const other = await browser.newPage();
    const otherProblems = await watch(other);
    await other.goto(page.url(), { waitUntil: "networkidle" });
    await expect(other.getByText("Loaded from a shared link")).toBeVisible();
    expect(await otherProblems()).toEqual(clean);
    await other.close();
  });
});
