# Implementation roadmap

Prioritised by value, risk and dependency. Each milestone is a vertical slice that keeps the app working. Status reflects the code on 2026-10-27; "done" means implemented **and** verified locally (not yet in CI unless stated).

## Milestone 1 — Engineering foundation

| # | Task | Status | Evidence / acceptance |
| --- | --- | --- | --- |
| 1.1 | Re-establish baseline; patch critical/high advisories | Done | Build was failing (`SecurityFatalError`); now green; audit 0 vulns (ADR-005) |
| 1.2 | Shared simulation contract; simulator fails closed | Done | 177 generated contract cases + manual mutation checks; overhead 0–5 % (ADR-002) |
| 1.3 | Benchmark harness and baseline | Done | `npm run bench:sim`; `benchmarks/README.md` |
| 1.4 | Experiment provenance (dataset/model version, experiment id, stale-link detection) | Done | Golden experiment, Python-verified dataset hashes, 4 browser tests (ADR-003) |
| 1.5 | CI: dependency audit gate + Dependabot | Done locally | Audit step fails on old lockfile; **not yet run on GitHub** |
| 1.6 | Architecture, ADR and threat-model docs | Done | `docs/` |
| 1.7 | Race registry generated from `data/races/*.json` (no code edit to add a race) | Done (Milestone 2, local) | 15 registry tests; staleness test; identity check (ADR-006) |
| 1.8 | Content-Security-Policy with nonces (Next.js + next-themes inline scripts) | Done (Milestone 2, local) | 14 browser tests with zero violations (incl. regression tests for two matcher bypasses); 12 policy unit tests; measured cost (ADR-007) |

## Milestone 2 — Simulation engine (builds on the existing model)

1. Explicit scenario type alongside strategies: neutralisation windows (SC/VSC) as **hypothetical inputs**, with pit-loss reduction under neutralisation; validated in `contract.ts`.
2. Per-lap event log in results (stop, neutralisation, cliff crossing) to support replay and explanation.
3. Multi-driver comparison (different reference drivers' pace) with shared assumptions.
4. Persisted experiment records (start with export/import of the JSON record; storage only when there is a reason).

Acceptance: golden tests extended; `MODEL_VERSION` bumped with recorded rationale; deterministic replay test from a saved record.

## Milestone 3 — Probabilistic simulation and optimisation

1. Seeded PRNG (e.g. xoshiro/PCG) in the contract; seed is part of the experiment spec.
2. Scenario sampler (SC probability per lap window, pit-loss jitter) → Monte Carlo with **common random numbers** across candidate strategies.
3. Confidence intervals and sensitivity analysis; constrained search over pit windows/compounds with compute limits and cancellation (run in a Web Worker).
4. Benchmark first (extend `bench:sim`); then decide on worker threads vs native code (ADR-004).

Acceptance: determinism under seed, statistical tests (coverage of CIs on known distributions), constraint tests; never claim a global optimum.

## Milestone 4 — AI race engineer (tool-using, evidence-grounded)

Typed experiment-spec tools over the existing `runExperiment`; the model's narrative is separate from authoritative results and always cites the experiment id. Benchmark set: known answers, invalid/missing/contradictory inputs, tool failures, prompt injection in untrusted data. Requires a server-side component and an LLM provider → **needs your decision** (credentials, cost, data sharing).

## Milestones 5–8 (outline)

5. **Data & replay:** provenance per field, data-quality report page, race-event timeline; adapters remain replaceable; synthetic datasets for benchmarks (licensing).
6. **Agent benchmark:** reproducible bug-injection tasks built from this codebase (e.g. the real stop-lap clamping bug and the long-stop misclassification, both already covered by regression tests), with reference fixes and tests that reject superficial fixes.
7. **Native interop:** only after Milestone 3 benchmarks show a bottleneck; golden experiments become cross-language test vectors.
8. **Production engineering:** structured logs, health checks, visual regression, Firefox/WebKit e2e — added when there is a deployment to operate.

## Decisions needed from you

- Committing and pushing this work (which also enables Dependabot pull requests on the repository).
- Milestone 4 requires an LLM provider, credentials and a cost budget.
- Any code licence remains your choice; data stays CC BY-NC-SA 4.0.
