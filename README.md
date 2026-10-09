# ApexStint

An interactive Formula 1 race-strategy explorer. Browse **recorded** race data (lap times, pit stops, tyre stints, results), then compare up to three **hypothetical** pit strategies with a transparent, deterministic model that explains exactly why their totals differ.

> Independent fan project. Not affiliated with Formula 1, the FIA, any team or tyre supplier. The simulator is a what-if calculator, not a reproduction of any team's race model.

## Features

| Area | What it does |
| --- | --- |
| **Race selection** (`/`) | Three bundled 2024 races, each card showing the winner's recorded tyre sequence. |
| **Race overview** (`/races/[id]`) | Headline stats, an interactive stint timeline for every car (hover/keyboard for detail, stoppages flagged), a lap-time chart (up to 4 drivers, toggle to hide non-representative laps), classification and pit-stop tables. Only fields present in the data are shown. |
| **Strategy lab** (`/races/[id]/strategy`) | Edit stint lengths, stop laps, compounds, starting tyre age and red-flag "free stops". Assumptions are split into *From data* (base lap, pit loss, both editable) and *Hypothetical* (tyre offsets, wear, cliff). Results: ranked totals, component breakdown, plain-language "why the totals differ", cumulative gap chart, and modelled vs recorded lap times. |
| **Sharing** | The full lab state is stored in a validated `?cfg=` URL parameter. "Copy share link" copies it; malformed links fall back to defaults with a notice. |
| **Data** (`/data`) | Sources, licence, season, per-race coverage, missing fields, race notes and limitations. |
| **Methodology** (`/methodology`) | Formulas, a worked example (pinned by a unit test), default assumptions, and what isn't modelled. |
| **Design** | Dark charcoal by default with a light theme, responsive down to 360 px, original logo mark, no official logos or third-party imagery. Compound identity always pairs colour with a letter (S/M/H/I/W). |

## Quick start

Requires Node.js 22.12+ or 24 (the range Vitest 5 supports; CI uses Node 22).

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm test` | Vitest unit tests (model, comparison, derivations, dataset, URL state) |
| `npm run typecheck` | Generates route types (`next typegen`) and runs `tsc --noEmit` |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run data:validate` | Schema-validates every bundled race and prints coverage plus cross-source warnings |
| `npm run data:fetch` | Rebuilds `data/` from the source APIs (network required) |
| `npm run check` | data:validate → typecheck → lint → test |
| `npm run test:e2e` | Playwright browser tests against the production build (run `npm run build` first) |
| `npm run test:e2e:build` | Build, then run the browser tests |

## Testing

**Unit tests** (Vitest, `src/**/*.test.ts`): the model, comparison, data derivations, dataset validation, URL state and formatting. Run `npm test`.

**End-to-end browser tests** (Playwright, `e2e/*.spec.ts`): 26 tests in headless Chromium against `next start`, the production server.

```bash
npx playwright install chromium   # once per machine (CI also needs --with-deps for system libraries)
npm run build                      # e2e runs against the production build
npm run test:e2e                   # starts `next start` on port 3100 automatically, then stops it
# or in one step:   npm run test:e2e:build
# options:          E2E_PORT=4000 npm run test:e2e   |   npx playwright test --headed   |   npx playwright show-report
```

What they cover:
- Stop-lap editing, typed one key at a time (the regression that turned "40" into 56), plus clamping of out-of-range laps and distance-mismatch errors.
- Adding and removing stops and strategies.
- Loading a recorded strategy.
- Reset.
- Share-link round-trip.
- Five kinds of malformed share link, plus an accepted hand-made link.
- Reference-driver restrictions.
- Clipboard copy (with granted permissions) and the manual-copy fallback.
- Stint-timeline hover, plus lap-chart and gap-chart hover tooltips.
- 404 handling, long-stop vs red-flag labelling, and the theme toggle.

`@playwright/test` is pinned to 1.63.0 so the browser revision is reproducible.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests (Ubuntu, Node 22): `npm ci` → data validation → type check → lint → unit tests → production build → install Playwright Chromium → e2e. It uploads the Playwright report when anything fails.

## Deployment

The app is a standard Next.js App Router project with no backend, database or environment variables.

- **Vercel**: import the repository and accept the defaults (framework: Next.js, build: `npm run build`).
- **Any Node host**: `npm ci && npm run build && npm run start` (respects `PORT`).
- **Containers**: run the same three commands in a `node:20-alpine` (or newer) image and expose the port.

Overview pages are statically pre-rendered. The strategy lab renders on demand because it reads `?cfg=`. The race JSON is bundled at build time, so there are no runtime file reads.

## Architecture

```
data/                      Bundled dataset (CC BY-NC-SA 4.0, see data/LICENSE.md)
  index.json, races/*.json
scripts/
  fetch-data.mjs           Builds data/ from Jolpica-F1 + OpenF1; never synthesises values
  validate-data.ts         Schema + consistency check (CI-friendly exit code)
src/lib/data/              DATA LAYER
  schema.ts                Zod schema, types, cross-source consistency checks
  repository.ts            RaceRepository interface + local JSON implementation
  derive.ts                Pure views: lap classification, timelines, coverage, medians
src/lib/sim/               SIMULATION (pure, deterministic, no React)
  model.ts                 Lap-time model, validation, stop/stint helpers, defaults
  compare.ts               Ranking, component deltas, explanations, crossovers
  recorded.ts              Recorded data → simulator starting points
src/lib/share/url-state.ts Validated base64url encoding of lab state
src/components/            UI (shadcn/ui primitives, Recharts charts)
src/app/                   Routes
e2e/                       Playwright browser tests (production build)
.github/workflows/ci.yml   CI: validate, typecheck, lint, unit, build, e2e
```

UI code depends only on `RaceRepository`. To plug in another *permitted* source (an API with suitable licensing, a database), implement `listRaces()` / `getRace()` and swap `raceRepository` in `src/lib/data/repository.ts`. Nothing else changes.

## The model

For lap *j* of a stint on compound *c* fitted at age *a₀*, tyre age is *a = a₀ + (j − 1)* and

```
lapTime = B + Δc + d_c·a + k_c·max(0, a − L_c + 1)
total   = Σ lapTime + P × (charged stops)
```

- **B** (base lap): median of the reference driver's clean recorded laps. *From data, editable.*
- **P** (pit loss): median recorded pit-lane time in the race. *From data, editable;* a proxy for true pit loss.
- **Δc, d_c, L_c, k_c** (offset, wear, cliff onset, cliff rate): **hypothetical** defaults, not derived from data.

Totals decompose exactly into base, compound, wear, cliff and pit components, so every gap between strategies is a sum of explainable differences. Not modelled: fuel burn (equal for all strategies), traffic, Safety Cars/VSC, weather, track evolution, warm-up and undercut effects. See `/methodology` for details.

## Data sources

| Source | Fields | Licence |
| --- | --- | --- |
| [Jolpica-F1](https://github.com/jolpica/jolpica-f1) (Ergast-compatible) | results, lap timings, pit stops | Data CC BY-NC-SA 4.0 (non-commercial; code is separately Apache-2.0) |
| [OpenF1](https://openf1.org) | tyre stints (compound, laps, tyre age) | CC BY-NC-SA 4.0; non-commercial use; does not claim ownership of underlying F1 data |

Bundled races: **2024 Bahrain GP** (R1), **2024 Japanese GP** (R4, red-flagged on lap 1), **2024 Italian GP** (R16). All three files pass the schema and the stint/pit-stop cross-check.

Data honesty rules enforced in code:

- Nothing is invented. Unparseable or absent values are stored as `null`, listed in `missingFields`, and rendered as "—" or a hatched "unknown" bar.
- Stints fall back to pit-stop boundaries with an *unknown* compound rather than a guessed one.
- Red-flag stoppages (> 10 min in the pit lane, e.g. Japan) are not counted as stops and are free in "as raced" strategies. Slow real stops (> 60 s) still count but are left out of the pit-loss default.
- Recorded values and hypothetical inputs are labelled throughout ("From data" / "Hypothetical" badges).
- If you ever add synthetic data, set `"kind": "demo"`. The UI then labels it "Demonstration data".

## Limitations

- Three races only; no telemetry, sector times, weather or Safety Car windows.
- Pit-lane time is entry-to-exit, so it only approximates pit loss.
- Tyre performance is not in the data; the tyre model is entirely user assumptions.
- Stints and lap times come from different sources (cross-checked, not guaranteed to agree for future additions).
- Data is CC BY-NC-SA 4.0: keep deployments **non-commercial** and keep the attribution. The project is **not cleared for commercial use**; see `data/LICENSE.md` for the sources' exact terms, which files are covered, and why.

## Review status (pre-portfolio audit)

**Published.** Public repository: https://github.com/darshanaiengineer-byte/apexstint (initial commit `7619761`, 2026-10-09).

**Verified locally (2026-10-09).** Test counts are from local runs:
- `npm run check` passes: data validation, typecheck, lint, and 62 unit tests.
- `npm run build` passes, and `npm audit --omit=dev` reports 0 vulnerabilities.
- `npm run test:e2e` passes 26/26 browser tests, three consecutive runs with no flakes.
- Before publishing, the full CI command sequence also passed on exactly the committed file set under Node 22.23.3 / npm 10.9.9, with the same counts.

**Verified on GitHub Actions.** The first CI run for `7619761` succeeded: https://github.com/darshanaiengineer-byte/apexstint/actions/runs/37946342307 (job `check`, `ubuntu-latest`).
- Every workflow step reported **success**, as confirmed through GitHub's public API: checkout, Node setup, `npm ci`, data validation, type check, lint, unit tests, production build, Playwright Chromium install (with system dependencies), and end-to-end tests.
- "Upload Playwright report" was skipped, as designed; it only runs on failure.
- The step statuses were confirmed, but the run's logs were not read. The test counts above come from local runs, not from GitHub's output.

**Automated vs manual.**
- Everything in the e2e list above is automated, including chart hover tooltips and clipboard copy. The clipboard contents are read back and compared with the page URL.
- The e2e suite was mutation-checked: re-introducing the old stop-lap bug makes the stop-lap test fail (expected "40", received "56").
- Still manual only: the earlier mobile/light-theme visual checks, and the Python cross-check of model totals and data-derived defaults (their values are now pinned in unit tests).

**Fixed during the audit.**
- Stop-lap and other numeric fields corrupted multi-digit input: typing "40" produced 56, because intermediate keystrokes were clamped and written back.
- Slow but real pit stops (> 60 s, e.g. Bottas, Bahrain 2024) were mislabelled as red-flag stoppages, dropped from stop counts, and could be made free. Stoppages now require > 10 minutes in the pit lane.
- A driver with no clean laps could be the reference, silently using a 90 s placeholder as "data".
- The recorded-vs-modelled comparison matched strategies by editable name rather than by their stints.
- Retired drivers were labelled "PR".
- The clipboard fallback used a blocking `window.prompt`.
- Added basic security headers and removed `X-Powered-By`.

**Mocked or hypothetical.** No feature is mocked. The tyre model's defaults (offsets, wear, cliffs) are illustrative assumptions, labelled "Hypothetical" in the UI. Base lap and pit loss are derived from data, and their sources are shown.

**Not applicable by design.** There are no accounts, authentication, authorization, tenants, server-side writes or API routes. All state lives in the URL, and every shared link is schema-validated with bounded numbers before use. No secrets or environment variables are used.

**External credentials.** None. `npm run data:fetch` calls public, keyless APIs.

**Not yet production-ready.**
- No Content-Security-Policy (needs nonce wiring for Next.js and next-themes inline scripts).
- Browser tests cover Chromium only. Firefox and WebKit, real mobile devices, and visual regression are not tested.
- Clipboard is tested with permissions granted in Chromium. Behaviour under other browsers' permission prompts isn't verified; the manual-copy fallback is tested.
- No error monitoring or analytics.
- No code licence chosen.
- Data licence is non-commercial (CC BY-NC-SA 4.0), and the project is not cleared for commercial distribution (`data/LICENSE.md`).

## Next steps

- Fit per-compound wear and offsets from recorded stints (fuel-corrected) and offer them as an optional "data-derived" preset, clearly labelled.
- Safety Car / VSC windows (e.g. from race-control messages) to model cheap stops.
- Traffic and undercut modelling with a gap-to-car-ahead input.
- More races, with a season/round picker and a generated repository registry.
- Extend e2e to Firefox/WebKit; CSV export of results.

## Licence

Code: no licence chosen yet, so all rights are reserved by default until one is added. Data in `data/`: CC BY-NC-SA 4.0, non-commercial only. `data/LICENSE.md` documents the sources' terms, which files are covered, and why commercial use is not cleared.
