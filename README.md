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
| `npm run data:fetch` | Rebuilds `data/races/` from the source APIs (network required); then run `registry:generate` |
| `npm run registry:generate` | Regenerates the race registry and `data/index.json` from `data/races/*.json` (see [Adding a race](#adding-a-race)) |
| `npm run registry:check` | Fails if the generated registry is stale (also enforced by `npm test`) |
| `npm run check` | data:validate → typecheck → lint → test |
| `npm run test:e2e` | Playwright browser tests against the production build (run `npm run build` first) |
| `npm run test:e2e:build` | Build, then run the browser tests |
| `npm run bench:sim` | Simulation benchmark harness (see `benchmarks/README.md`) |

**Evaluation tasks** (Python 3.11 or 3.12 — 3.11 is exercised only in CI; run from `evals/`; see [`evals/README.md`](evals/README.md)): `python -m pytest -q` runs the harness and task tests; `python -m apexstint_evals selftest tasks/move-stop-distance` proves the reference passes and the seeded bug and five plausible wrong fixes fail; `python -m apexstint_evals run tasks/move-stop-distance --candidate-dir <dir>` evaluates a solution and prints a JSON report.

## Testing

**Unit tests** (Vitest, `src/**/*.test.ts`): the model, comparison, data derivations, dataset validation, URL state, formatting, the simulation input contract (cases generated from `LIMITS`, including share-link/simulator agreement) and experiment provenance (golden reference experiment, dataset hashes). Run `npm test`.

**End-to-end browser tests** (Playwright, `e2e/*.spec.ts`): 44 tests in headless Chromium against `next start`, the production server.

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
- Experiment provenance: a stable experiment id that changes with inputs and survives a share-link round-trip; stale-dataset links warned; links for another race rejected.
- Content-Security-Policy (`e2e/csp.spec.ts`): every route (and the 404 page) loads and hydrates under the enforced policy with zero CSP violations, console errors or page errors; every script carries the response's nonce; nonces differ per response; a client-supplied `x-nonce` is ignored (including on prefetch-flagged requests); every HTML response, including look-alikes of excluded asset paths, carries the policy; navigation, lab editing, charts and share links work under the policy.

`@playwright/test` is pinned to 1.63.0 so the browser revision is reproducible.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests (Ubuntu, Node 22): `npm ci` → production dependency audit (fails on high/critical advisories) → data validation → type check → lint → unit tests → production build → install Playwright Chromium → e2e. It uploads the Playwright report when anything fails. A second job, `evals` (Python 3.11 and 3.12), lints the evaluation harness, validates every task, runs its tests and each task's self-test. `.github/dependabot.yml` checks npm and GitHub Actions updates weekly.

## Deployment

The app is a standard Next.js App Router project with no backend, database or environment variables.

- **Vercel**: import the repository and accept the defaults (framework: Next.js, build: `npm run build`).
- **Any Node host**: `npm ci && npm run build && npm run start` (respects `PORT`).
- **Containers**: run the same three commands in a `node:22-alpine` (or `node:24-alpine`) image and expose the port. Node 20 is not supported.

Every page is rendered per request: the nonce-based Content-Security-Policy (set by `src/proxy.ts`) cannot be embedded in static HTML. Deploy to a Node server (`next start`, Vercel, a container), not a static host; responses are `Cache-Control: private, no-store`, so put no shared cache in front of HTML. The race JSON is bundled at build time, so there are no runtime file reads. See [ADR-007](docs/architecture/architecture-decisions.md) for the measured performance cost.

### Adding a race

1. Add the race to `RACES` in `scripts/fetch-data.mjs` and run `npm run data:fetch` (or add a schema-valid `data/races/<id>.json` whose `id` equals the file name).
2. Run `npm run registry:generate`. It validates every dataset and regenerates `src/lib/data/race-registry.generated.ts` and `data/index.json`; a malformed file, schema failure or id/filename mismatch stops it with a message naming the file.
3. Run `npm run check`. No application code changes are needed.

## Architecture

```
data/                      Bundled dataset (CC BY-NC-SA 4.0, see data/LICENSE.md)
  races/*.json             One file per race; the single source of truth for which races exist
  index.json               Generated summary (id, season, round, name)
scripts/
  fetch-data.mjs           Builds data/races/ from Jolpica-F1 + OpenF1; never synthesises values
  generate-race-registry.ts Validates data/races/ and generates the registry + index.json
  validate-data.ts         Schema + consistency check (CI-friendly exit code)
src/lib/data/              DATA LAYER
  schema.ts                Zod schema, types, cross-source consistency checks
  race-registry.generated.ts  Generated static imports of every race file (do not edit)
  repository.ts            RaceRepository interface + local implementation (rejects key/id mismatches)
  derive.ts                Pure views: lap classification, timelines, coverage, medians
src/lib/sim/               SIMULATION (pure, deterministic, no React)
  contract.ts              Single source of truth for every numeric input limit
  model.ts                 Lap-time model, fail-closed validation, stop/stint helpers, MODEL_VERSION
  experiment.ts            Reproducible experiments: spec → deterministic id + results + report
  compare.ts               Ranking, component deltas, explanations, crossovers
  recorded.ts              Recorded data → simulator starting points
src/lib/canonical.ts       Canonical JSON + FNV-1a-64 (identities)
src/lib/share/url-state.ts Validated base64url encoding of lab state (with optional provenance)
src/lib/security/csp.ts    Content-Security-Policy builder (per-request nonce)
src/proxy.ts               Next.js proxy: generates the nonce and sets the CSP header per request
src/lib/zod-setup.ts       Runs zod without eval (required by the CSP)
src/components/            UI (shadcn/ui primitives, Recharts charts)
src/app/                   Routes
e2e/                       Playwright browser tests (production build)
evals/                     Python harness for reproducible coding-agent tasks (independent of the app)
.github/workflows/ci.yml   CI: audit, validate, typecheck, lint, unit, build, e2e
benchmarks/                Simulation benchmark harness and baseline
docs/                      Architecture overview, ADRs, roadmap, threat model
```

Design documentation: [system overview](docs/architecture/system-overview.md), [architecture decisions](docs/architecture/architecture-decisions.md), [roadmap](docs/architecture/implementation-roadmap.md), [threat model](docs/security/threat-model.md).

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

**Milestone 2 — race registry and Content-Security-Policy (2026-10-27, local, not yet committed or run in CI).**
- Race availability is generated from `data/races/*.json` (validated, deterministic); the repository refuses to serve a dataset under a key that differs from its declared id. Data files and dataset hashes are unchanged.
- An enforced, nonce-based CSP: no `'unsafe-inline'` or `'unsafe-eval'` for scripts in production; the one exception is `style-src-attr 'unsafe-inline'`. Every page is now rendered per request, which measurably costs throughput (ADR-007).
- `npm run check` passes with 310 unit tests; `npm run build` passes; `npm run test:e2e` passes 44/44 browser tests. The 2026-10-28 review found and fixed two CSP bypasses in the proxy matcher (prefetch-flagged requests, and unanchored asset exclusions that let look-alike paths serve the HTML 404 page without a policy) and measured a static-preserving hybrid alternative (ADR-007).

**Milestone 1 — engineering foundation (commit `b5dd51b`; GitHub Actions run 40545116827 passed).**
- Security: `next` 16.4.0 → 16.4.3 (two critical remote-code-execution advisories and one high-severity denial-of-service advisory) and `zod` → 4.6.7 (one high). `/_next/image` was reachable by default; the app does not use `use cache` or Server Actions; whether the 16.4.0 deployment was exploitable was not verified. See ADR-005. Before the upgrade `next build` failed with `SecurityFatalError`; after it, `npm audit` reports 0 vulnerabilities.
- `npm run check` passes with 283 unit tests; `npm run build` passes; `npm run test:e2e` passes 30/30 browser tests in three consecutive runs.
- New: fail-closed simulation contract, reproducible experiment ids with dataset/model versions, benchmark harness, CI audit gate and Dependabot. See the [roadmap](docs/architecture/implementation-roadmap.md).

**Verified locally (2026-10-09, at publication).** Test counts are from local runs:
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
- The e2e suite was mutation-checked manually (by hand, not automated): re-introducing the old stop-lap bug makes the stop-lap test fail (expected "40", received "56").
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
- The CSP allows inline style *attributes* (`style-src-attr 'unsafe-inline'`), and pages render per request (lower throughput than static pages; see ADR-007). It has only been verified on a local production server, not behind a real host or CDN.
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
