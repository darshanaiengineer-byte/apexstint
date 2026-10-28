# System overview

_Last verified against the code: 2026-10-27. "Confirmed" statements were checked in the repository or by running it; "Proposal" statements are not implemented._

## What ApexStint is today (confirmed)

A single **Next.js 16 App Router** application (TypeScript, React 19, Tailwind 4, shadcn-style primitives, Recharts). There is no separate backend, database, queue or native code. Alongside it, `evals/` is an independent Python harness for reproducible coding tasks derived from the app's invariants (ADR-008); it does not import or run the app. All race data is bundled at build time; all simulation runs in the browser. Every page is rendered per request so that it can carry a per-request CSP nonce (`src/proxy.ts`, ADR-007).

```
data/races/*.json ──(scripts/generate-race-registry.ts)──▶ race-registry.generated.ts ──(static imports)──▶ repository.ts ──▶ server components
  Jolpica-F1 + OpenF1     zod schema (schema.ts)        RaceLoadResult {race, datasetVersion}     │ props (pre-shaped, serialisable)
  (scripts/fetch-data)    pure views (derive.ts)                                                   ▼
                                                                                    client components (src/components/**)
                                                                                    │  share-link state (src/lib/share/url-state.ts)
                                                                                    ▼
                                                     src/lib/sim/{contract,model,compare,experiment,recorded}.ts
```

| Layer | Modules | Responsibility | Runs |
| --- | --- | --- | --- |
| Data acquisition | `scripts/fetch-data.mjs` | Builds `data/` from two open APIs; never synthesises values | Manually, network |
| Evaluation tasks | `evals/apexstint_evals/`, `evals/tasks/*/` | Runs candidate solutions against behavioural verifiers; JSON reports; task self-tests (ADR-008) | Locally (3.12), CI (`evals` job: 3.11 and 3.12) |
| Data validation | `src/lib/data/schema.ts`, `scripts/validate-data.ts` | zod schema + referential and cross-source consistency checks | Load time, CI |
| Race registry | `scripts/generate-race-registry.ts` → `src/lib/data/race-registry.generated.ts`, `data/index.json` | Validates every race file and generates the list of races (ADR-006) | Build/dev time; staleness enforced by tests |
| Data access | `src/lib/data/repository.ts` | `RaceRepository` interface; local implementation over the generated registry; rejects key/`id` mismatches; content-hash `datasetVersion` | Server only (`node:crypto`) |
| Security headers & CSP | `src/proxy.ts`, `src/lib/security/csp.ts`, `next.config.ts` | Per-request nonce CSP; static security headers | Every document request |
| Derivations | `src/lib/data/derive.ts` | Clean-lap classification, timelines, coverage, medians (pure, read-only) | Server |
| Simulation contract | `src/lib/sim/contract.ts` | Single source of truth for every numeric input limit | Shared |
| Simulation model | `src/lib/sim/model.ts` | Deterministic additive lap-time model; validates all inputs, fails closed | Browser, tests, bench |
| Comparison | `src/lib/sim/compare.ts` | Ranking, exact component deltas, explanations, crossovers | Browser |
| Experiments | `src/lib/sim/experiment.ts`, `src/lib/canonical.ts` | Reproducible spec → deterministic id + results + report | Browser |
| Recorded → inputs | `src/lib/sim/recorded.ts` | Recorded stints/defaults as labelled starting points | Server |
| Share links | `src/lib/share/url-state.ts` | Validated base64url state in `?cfg=`, with optional provenance | Server decode, browser encode |
| UI | `src/app/**`, `src/components/**` | Pages, stint timeline, charts, strategy lab | Server + browser |

## Domain model (confirmed)

- **Race** (`schema.ts`): drivers, results, laps, pit stops, stints; every source-optional value is nullable. Two pit-stop anomaly classes: *long stop* (> 60 s, still a stop) and *red-flag stoppage* (> 10 min, not a stop).
- **Strategy**: 1–6 stints `{compound, laps, tyreAgeAtStart, freeStop}`; stints must sum to the race distance.
- **Assumptions**: base lap, pit loss, and per-compound `{paceOffset, wear, cliffAfter, cliffRate}`. Base lap and pit loss default from recorded data; the tyre model is hypothetical.
- **Experiment**: `{raceId, datasetVersion, modelVersion, totalLaps, assumptions, strategies}` → `exp_<FNV-1a-64 of canonical JSON>`. The model is deterministic and has no randomness, so equal ids imply identical results.

Model formula and its omissions: see `/methodology` in the app and `src/lib/sim/model.ts`.

## Invariants enforced in code (confirmed)

| Invariant | Where | Test |
| --- | --- | --- |
| Every numeric input is finite and inside `LIMITS`; free stops must be booleans; unknown compounds, missing tyre models and invalid race distances are rejected | `validateStrategy`, `validateAssumptions` | `contract.test.ts` (generated from `LIMITS`) |
| A validated input never yields a non-finite total (fail-closed guard) | `simulate` | `contract.test.ts` regressions |
| Share-link decoder and encoder accept exactly what the simulator accepts; the encoder refuses (returns null) rather than silently changing a state | shared `LIMITS` + decoder schema | `contract.test.ts` agreement cases, `url-state.test.ts` |
| Stint distance is preserved by stop-lap edits | `moveStop` | `model.test.ts`, e2e |
| Component deltas sum exactly to the gap | `compareStrategies` | `compare.test.ts` |
| Same spec ⇒ same experiment id and results; any input change ⇒ new id | `experiment.ts` | `experiment.test.ts` (golden reference) |
| Dataset version = SHA-256 of canonical race JSON | `repository.ts` | `experiment.test.ts` (cross-checked in Python) |
| Race files satisfy the schema; stints agree with pit-stop laps | `schema.ts` | `dataset.test.ts`, `npm run data:validate` |

## Verification (confirmed, 2026-10-27, local)

`npm run check` (data validation, typecheck, lint, 310 unit tests), `npm run build`, `npm run test:e2e` (44 browser tests, including 14 CSP tests), `npm audit` (0 vulnerabilities after the security upgrade). GitHub Actions run 40545116827 passed for Milestone 1 (`b5dd51b`) and run 40641851204 for Milestone 2 (`0b8702d`, registry and CSP; step conclusions read from the public run page, logs not read). Python harness (2026-10-28, local, Python 3.12 only): 108 pytest tests, `ruff` clean, `selftest` 7/7 controls as declared; the `evals` CI job (3.11 and 3.12) has not run yet.

## Performance (confirmed by `npm run bench:sim`)

Single simulation ≈ 2.5–4 µs; a lab edit (3 strategies + comparison) ≈ 14 µs; exhaustive search over all 37,296 legal 1–2-stop dry strategies ≈ 100 ms (≈ 380k simulations/s, one core, i5-10300H, Node 24). Input validation costs 0–5 % (within noise). Pages: 8–27 KB gzipped HTML. See `benchmarks/README.md`.

## Known limitations (confirmed)

- No uncertainty: no Safety Car/VSC, traffic, weather or fuel model; tyre parameters are illustrative, not calibrated.
- Three bundled races; adding one needs a data file and `npm run registry:generate`, no code change.
- CSP allows inline style attributes (`style-src-attr 'unsafe-inline'`); every page renders per request (measured cost in ADR-007).
- No rate limiting, error monitoring or structured logging.
- Data is CC BY-NC-SA 4.0 and **not cleared for commercial use** (`data/LICENSE.md`); no code licence is chosen.
