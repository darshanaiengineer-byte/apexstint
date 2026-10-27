# Benchmarks

```bash
npm run bench:sim                          # full run (≈ 5 s)
npm run bench:sim -- --quick               # smoke run
npm run bench:sim -- --out=results.json    # also write a JSON report (environment + per-workload stats)
```

`sim-bench.ts` measures the authoritative TypeScript simulator on fixed inputs (2024 Bahrain data, default hypothetical tyre model), with a JIT warm-up and per-iteration timing (median, p95, min). It is **not** run in CI: shared runners are too noisy to gate on. Compare changes by running old and new code alternately on the same machine.

| Workload | What it represents |
| --- | --- |
| `simulate.single` | One 3-stint strategy over 57 laps |
| `lab.recompute` | One edit in the strategy lab: 3 strategies + comparison |
| `search.exhaustive` | Every legal 1- and 2-stop dry strategy (37,296), keeping the best total — the shape of an optimiser |

## Baseline (2026-10-27)

Intel Core i5-10300H, Node v24.22.1, Linux, one core. Three alternating runs each of `HEAD` (`54e9f77`) and the working tree with input validation (ADR-002); median of the three run medians.

| Workload | `54e9f77` | With validation | Throughput (with validation) |
| --- | --- | --- | --- |
| `simulate.single` | 0.0026 ms | 0.0026 ms | ≈ 380k sims/s |
| `lab.recompute` | 0.0134 ms | 0.0140 ms | ≈ 220k sims/s |
| `search.exhaustive` (37,296 sims) | 99.6 ms | 102.8 ms | ≈ 360k sims/s |

Conclusion (ADR-004): the deterministic simulator is not a bottleneck, so a native kernel is not justified by current workloads. Re-measure when Monte Carlo is added.
