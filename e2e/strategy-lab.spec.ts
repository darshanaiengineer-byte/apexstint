import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Critical strategy-lab journeys. Values asserted here come from the bundled 2024
 * Bahrain/Japan data and the default (hypothetical) tyre model; if either changes
 * on purpose, update the expectations alongside it.
 */

const BAHRAIN = "/races/2024-01-bahrain/strategy";
const JAPAN = "/races/2024-04-japan/strategy";

const strategy = (page: Page, i: number) => page.locator('section[aria-label^="Strategy "]').nth(i);
const stintLaps = (s: Locator) => s.locator('input[aria-label$="length in laps"]');
const totalsRows = (page: Page) => page.locator("table").first().locator("tbody tr");

/** Assert the current values of every matched input/select, in order (retries until they match). */
async function expectValues(fields: Locator, values: string[]) {
  await expect.poll(() => fields.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(values);
}

/** Type like a person: one key at a time (this is what exposed the clamping bug). */
async function typeInto(field: Locator, text: string) {
  await field.click();
  await field.press("ControlOrMeta+a");
  await field.pressSequentially(text);
  await field.press("Enter");
}

const decodeCfg = (cfg: string) => JSON.parse(Buffer.from(cfg, "base64url").toString("utf8"));

/**
 * The URL is updated on a short debounce, so wait until it reflects the expected edit
 * (`ready` inspects the decoded config) instead of grabbing the first cfg that appears.
 */
async function cfgFromUrl(page: Page, ready: (cfg: ReturnType<typeof decodeCfg>) => boolean = () => true) {
  const read = () => new URL(page.url()).searchParams.get("cfg");
  await expect.poll(() => {
    const cfg = read();
    return cfg != null && ready(decodeCfg(cfg));
  }).toBe(true);
  return read()!;
}
const encodeCfg = (obj: unknown) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");

test.describe("stop-lap editing", () => {
  test("multi-digit stop laps are applied as typed", async ({ page }) => {
    await page.goto(BAHRAIN);
    const s = strategy(page, 0);
    await expectValues(stintLaps(s), ["17", "20", "20"]);

    await typeInto(s.getByLabel("Stop 2 lap"), "40");
    await expect(s.getByLabel("Stop 2 lap")).toHaveValue("40");
    await expectValues(stintLaps(s), ["17", "23", "17"]);
    await expect(s.getByText("57/57 laps · 2 stops")).toBeVisible();
  });

  test("out-of-range stop laps are clamped and the clamped value is shown", async ({ page }) => {
    await page.goto(BAHRAIN);
    const s = strategy(page, 0);
    await typeInto(s.getByLabel("Stop 2 lap"), "70");
    await expect(s.getByLabel("Stop 2 lap")).toHaveValue("56");
    await expectValues(stintLaps(s), ["17", "39", "1"]);
  });

  test("a stint total that does not match the race distance is reported, not simulated", async ({ page }) => {
    await page.goto(BAHRAIN);
    const s = strategy(page, 1);
    await typeInto(stintLaps(s).first(), "10");
    await expect(s.getByRole("alert")).toContainText("Stints cover 38 laps but the race is 57 laps");
    await expect(totalsRows(page)).toHaveCount(2);
  });
});

test.describe("adding and removing stops", () => {
  test("add stop splits the longest stint; remove stint merges it, preserving distance", async ({ page }) => {
    await page.goto(BAHRAIN);
    const s = strategy(page, 1);
    await expectValues(stintLaps(s), ["29", "28"]);

    await s.getByRole("button", { name: "Add stop" }).click();
    await expectValues(stintLaps(s), ["15", "14", "28"]);
    await expect(s.getByText("57/57 laps · 2 stops")).toBeVisible();

    await s.getByRole("button", { name: "Remove stint 1" }).click();
    await expectValues(stintLaps(s), ["29", "28"]);
    await expect(s.getByText("57/57 laps · 1 stop")).toBeVisible();
    // Both remaining stints are hard now, which breaks the two-compound rule.
    await expect(s.getByText(/two different dry compounds/)).toBeVisible();
  });

  test("strategies can be removed and added (max three)", async ({ page }) => {
    await page.goto(BAHRAIN);
    await expect(page.locator('section[aria-label^="Strategy "]')).toHaveCount(3);
    const add = page.getByRole("button", { name: /Add strategy/ });
    await expect(add).toBeDisabled();

    await strategy(page, 1).getByRole("button", { name: /Remove strategy/ }).click();
    await expect(page.locator('section[aria-label^="Strategy "]')).toHaveCount(2);
    await expect(totalsRows(page)).toHaveCount(2);

    await add.click();
    await expect(page.locator('section[aria-label^="Strategy "]')).toHaveCount(3);
    await expect(totalsRows(page)).toHaveCount(3);
  });
});

test("loading a recorded strategy uses the driver's recorded stints", async ({ page }) => {
  await page.goto(BAHRAIN);
  const s = strategy(page, 2);
  await s.getByLabel("Load a driver's recorded strategy").selectOption("leclerc");
  await expect(s.getByLabel("Strategy name")).toHaveValue("LEC as raced");
  await expectValues(stintLaps(s), ["11", "23", "23"]);
  await expectValues(s.locator('select[aria-label$="compound"]'), ["SOFT", "HARD", "HARD"]);
  await expectValues(s.locator('input[aria-label$="tyre age at fitting"]'), ["3", "0", "0"]);
});

test("reset restores defaults and clears the share parameter", async ({ page }) => {
  await page.goto(BAHRAIN);
  const reset = page.getByRole("button", { name: "Reset", exact: true });
  await expect(reset).toBeDisabled();

  await typeInto(page.getByLabel("Pit loss per stop (s)"), "30");
  await strategy(page, 1).getByRole("button", { name: "Add stop" }).click();
  await expect(page).toHaveURL(/cfg=/);
  await expect(reset).toBeEnabled();

  await reset.click();
  await expect(page.getByLabel("Pit loss per stop (s)")).toHaveValue("25");
  await expectValues(stintLaps(strategy(page, 1)), ["29", "28"]);
  await expect(page).not.toHaveURL(/cfg=/);
  await expect(reset).toBeDisabled();
});

test("share link round-trips the full lab state", async ({ page, browser }) => {
  await page.goto(BAHRAIN);
  await typeInto(strategy(page, 0).getByLabel("Stop 1 lap"), "20");
  await typeInto(page.getByLabel("Base lap (s)"), "96.5");
  const cfg = await cfgFromUrl(page, (c) => c.a.b === 96.5 && c.s[0].t[0][1] === 20);
  const totals = await totalsRows(page).allInnerTexts();

  const other = await browser.newPage();
  await other.goto(`${BAHRAIN}?cfg=${cfg}`);
  await expect(other.getByText("Loaded from a shared link")).toBeVisible();
  await expect(other.getByLabel("Base lap (s)")).toHaveValue("96.5");
  await expectValues(stintLaps(strategy(other, 0)), ["20", "17", "20"]);
  expect(await totalsRows(other).allInnerTexts()).toEqual(totals);
  await other.close();
});

test.describe("malformed share links fall back to defaults with a notice", () => {
  const valid = {
    v: 1,
    d: "max_verstappen",
    a: {
      b: 95.5,
      p: 25,
      c: { SOFT: [-0.6, 0.1, 18, 0.25], MEDIUM: [0, 0.06, 30, 0.2], HARD: [0.4, 0.035, 45, 0.15], INTERMEDIATE: [5, 0.15, 25, 0.3], WET: [9, 0.1, 30, 0.3] },
    },
    s: [{ n: "x", t: [["M", 29, 0, 0], ["H", 28, 0, 0]] }],
  };
  const cases: Record<string, string> = {
    "not base64 / not JSON": "%%%not-a-config",
    "wrong schema version": encodeCfg({ ...valid, v: 2 }),
    "out-of-range pit loss": encodeCfg({ ...valid, a: { ...valid.a, p: 9999 } }),
    "unknown driver": encodeCfg({ ...valid, d: "nobody" }),
    "too many strategies": encodeCfg({ ...valid, s: [valid.s[0], valid.s[0], valid.s[0], valid.s[0]] }),
  };
  for (const [name, cfg] of Object.entries(cases)) {
    test(name, async ({ page }) => {
      const res = await page.goto(`${BAHRAIN}?cfg=${encodeURIComponent(cfg)}`);
      expect(res?.status()).toBe(200);
      await expect(page.getByText("Shared link couldn’t be read")).toBeVisible();
      await expectValues(stintLaps(strategy(page, 0)), ["17", "20", "20"]);
    });
  }

  test("a valid hand-made link is accepted", async ({ page }) => {
    await page.goto(`${BAHRAIN}?cfg=${encodeCfg(valid)}`);
    await expect(page.getByText("Loaded from a shared link")).toBeVisible();
    await expect(page.locator('section[aria-label^="Strategy "]')).toHaveCount(1);
  });
});

test.describe("reference-driver restrictions", () => {
  test("drivers without clean recorded laps cannot be the reference", async ({ page }) => {
    await page.goto(JAPAN);
    const select = page.getByLabel("Reference driver");
    await expect(select.locator("option:disabled")).toHaveText([
      "Ret · RIC — Daniel Ricciardo (no clean laps)",
      "Ret · ALB — Alexander Albon (no clean laps)",
    ]);
    await expect(page.getByRole("heading", { name: "Race inputs From data" })).toBeVisible();
  });

  test("changing the reference driver re-derives the base lap from that driver's laps", async ({ page }) => {
    await page.goto(BAHRAIN);
    await page.getByLabel("Reference driver").selectOption("leclerc");
    await expect(page.getByText(/Median of \d+ clean recorded laps by LEC/)).toBeVisible();
    await expect(page.getByLabel("Base lap (s)")).not.toHaveValue("95.529");
  });

  test("a shared link naming such a driver is labelled as a placeholder, not data", async ({ page }) => {
    await page.goto(JAPAN);
    await typeInto(page.getByLabel("Pit loss per stop (s)"), "24");
    const cfg = decodeCfg(await cfgFromUrl(page, (c) => c.a.p === 24));
    await page.goto(`${JAPAN}?cfg=${encodeCfg({ ...cfg, d: "ricciardo" })}`);
    await expect(page.getByRole("heading", { name: "Race inputs Placeholder" })).toBeVisible();
    await expect(page.getByText(/No clean laps for RIC; placeholder 90 s/)).toBeVisible();
  });
});

test.describe("clipboard", () => {
  test("copy share link writes the current URL to the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(BAHRAIN);
    await typeInto(strategy(page, 0).getByLabel("Stop 1 lap"), "15");
    const cfg = await cfgFromUrl(page, (c) => c.s[0].t[0][1] === 15);

    await page.getByRole("button", { name: "Copy share link" }).click();
    await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(copied).searchParams.get("cfg")).toBe(cfg);
    expect(new URL(copied).pathname).toBe(BAHRAIN);
  });

  test("when the clipboard is unavailable the link is shown for manual copying", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: () => Promise.reject(new Error("denied")) },
        configurable: true,
      });
    });
    await page.goto(BAHRAIN);
    await page.getByRole("button", { name: "Copy share link" }).click();
    const field = page.getByLabel(/Copy this link manually/);
    await expect(field).toBeVisible();
    await expect(field).toHaveValue(/\/races\/2024-01-bahrain\/strategy\?cfg=/);
  });
});

test.describe("experiment provenance", () => {
  const experimentIdOf = (page: Page) => page.getByTestId("experiment-id");

  test("the lab shows a stable experiment id that changes with the inputs", async ({ page }) => {
    await page.goto(BAHRAIN);
    await expect(page.getByTestId("dataset-version")).toHaveText(/^sha256:[0-9a-f]{16}$/);
    const initial = await experimentIdOf(page).textContent();
    expect(initial).toMatch(/^exp_[0-9a-f]{16}$/);

    await page.reload();
    await expect(experimentIdOf(page)).toHaveText(initial!);

    await typeInto(page.getByLabel("Pit loss per stop (s)"), "26");
    await expect(experimentIdOf(page)).not.toHaveText(initial!);
  });

  test("a share link reproduces the same experiment id", async ({ page, browser }) => {
    await page.goto(BAHRAIN);
    await typeInto(strategy(page, 1).getByLabel("Stop 1 lap"), "24");
    const cfg = await cfgFromUrl(page, (c) => c.s[1].t[0][1] === 24);
    const id = await experimentIdOf(page).textContent();

    const other = await browser.newPage();
    await other.goto(`${BAHRAIN}?cfg=${cfg}`);
    await expect(other.getByText("Loaded from a shared link")).toBeVisible();
    await expect(experimentIdOf(other)).toHaveText(id!);
    await other.close();
  });

  test("a link made with an older dataset version loads with a warning", async ({ page }) => {
    await page.goto(BAHRAIN);
    await typeInto(page.getByLabel("Pit loss per stop (s)"), "24");
    const cfg = decodeCfg(await cfgFromUrl(page, (c) => c.a.p === 24));
    expect(cfg.dv).toMatch(/^sha256:/);
    await page.goto(`${BAHRAIN}?cfg=${encodeCfg({ ...cfg, dv: "sha256:0000000000000000" })}`);
    await expect(page.getByText("Shared link made with an older dataset")).toBeVisible();
    await expect(page.getByLabel("Pit loss per stop (s)")).toHaveValue("24");
  });

  test("a link made for a different race is rejected", async ({ page }) => {
    await page.goto(BAHRAIN);
    await typeInto(page.getByLabel("Pit loss per stop (s)"), "24");
    const cfg = decodeCfg(await cfgFromUrl(page, (c) => c.a.p === 24));
    await page.goto(`${BAHRAIN}?cfg=${encodeCfg({ ...cfg, r: "2024-04-japan" })}`);
    await expect(page.getByText("Shared link couldn’t be read")).toBeVisible();
    await expect(page.getByLabel("Pit loss per stop (s)")).toHaveValue("25");
  });
});
