/**
 * Simulation benchmark harness.  npm run bench:sim [-- --quick] [-- --out=path.json]
 *
 * Measures the authoritative TypeScript simulator on fixed, representative workloads so
 * that any optimisation (or native port) is judged against numbers, not intuition.
 * Inputs are deterministic (2024 Bahrain data + default hypothetical tyre model), so
 * results differ between runs only by machine noise. Not run in CI (timings on shared
 * runners are too noisy to gate on).
 */
import { writeFileSync } from "node:fs";
import os from "node:os";
import { raceRepository } from "../src/lib/data/repository";
import { compareStrategies } from "../src/lib/sim/compare";
import { DRY_COMPOUNDS, defaultAssumptions, simulate, type Strategy, type StrategyStint } from "../src/lib/sim/model";
import { initialStrategies, recordedDefaults } from "../src/lib/sim/recorded";

const args = new Set(process.argv.slice(2));
const quick = args.has("--quick");
const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice(6);

interface Result {
  name: string;
  description: string;
  iterations: number;
  opsPerIteration: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  opsPerSec: number;
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;

function measure(name: string, description: string, opsPerIteration: number, iterations: number, fn: () => unknown): Result {
  let sink: unknown;
  for (let i = 0; i < Math.max(3, Math.floor(iterations / 10)); i++) sink = fn(); // warm-up (JIT)
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint();
    sink = fn();
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  if (sink === Symbol.for("never")) console.log(sink); // keep the result observable so it isn't optimised away
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  return {
    name,
    description,
    iterations,
    opsPerIteration,
    medianMs: round(median),
    p95Ms: round(samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))]),
    minMs: round(samples[0]),
    opsPerSec: Math.round((opsPerIteration / median) * 1000),
  };
}

/** Every legal 1- and 2-stop dry strategy (≥ 2 compounds, every stint ≥ 1 lap). */
function enumerateStrategies(totalLaps: number): Strategy[] {
  const out: Strategy[] = [];
  const st = (compound: StrategyStint["compound"], laps: number): StrategyStint => ({ compound, laps, tyreAgeAtStart: 0, freeStop: false });
  for (const a of DRY_COMPOUNDS)
    for (const b of DRY_COMPOUNDS)
      for (let s1 = 1; s1 < totalLaps; s1++) {
        if (a !== b) out.push({ id: `s${out.length}`, name: "", stints: [st(a, s1), st(b, totalLaps - s1)] });
        for (const c of DRY_COMPOUNDS) {
          if (a === b && b === c) continue;
          for (let s2 = s1 + 1; s2 < totalLaps; s2++) out.push({ id: `s${out.length}`, name: "", stints: [st(a, s1), st(b, s2 - s1), st(c, totalLaps - s2)] });
        }
      }
  return out;
}

async function main() {
  const res = await raceRepository.getRace("2024-01-bahrain");
  if (!res.ok) throw new Error("benchmark dataset failed validation");
  const race = res.race;
  const d = recordedDefaults(race, "max_verstappen");
  const assumptions = defaultAssumptions(d.baseLapSec, d.pitLossSec);
  const lab = initialStrategies(race, "max_verstappen");
  const space = enumerateStrategies(race.scheduledLaps);
  const n = race.scheduledLaps;

  const results: Result[] = [
    measure("simulate.single", `one 3-stint strategy, ${n} laps`, 1, quick ? 2_000 : 20_000, () => simulate(lab[0], assumptions, n)),
    measure("lab.recompute", "3 strategies + comparison (what one edit in the lab triggers)", 3, quick ? 1_000 : 10_000, () =>
      compareStrategies(lab, lab.map((s) => simulate(s, assumptions, n))),
    ),
    measure("search.exhaustive", `all ${space.length} legal 1–2 stop dry strategies, best by total`, space.length, quick ? 3 : 15, () => {
      let best = Infinity;
      for (const s of space) {
        const r = simulate(s, assumptions, n);
        if (r.totalSec != null && r.totalSec < best) best = r.totalSec;
      }
      return best;
    }),
  ];

  const report = {
    tool: "apexstint sim-bench",
    date: new Date().toISOString(),
    dataset: race.id,
    environment: { node: process.version, platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? "unknown", cores: os.cpus().length },
    results,
  };
  console.table(results.map(({ name, opsPerIteration, medianMs, p95Ms, opsPerSec }) => ({ name, opsPerIteration, medianMs, p95Ms, simsPerSec: opsPerSec })));
  console.log(JSON.stringify(report.environment));
  if (outArg) writeFileSync(outArg, JSON.stringify(report, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
