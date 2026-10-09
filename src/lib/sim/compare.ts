import type { Components, SimResult, Strategy } from "./model";

export interface ComponentDelta {
  key: keyof Components;
  label: string;
  deltaSec: number;
}

export interface StrategyComparison {
  strategyId: string;
  name: string;
  rank: number;
  totalSec: number;
  /** Gap to the fastest valid strategy (0 for the fastest). */
  gapSec: number;
  deltas: ComponentDelta[];
  explanation: string[];
}

export interface ComparisonReport {
  fastestId: string | null;
  rows: StrategyComparison[];
  /** Laps where the cumulative-time order between a pair changes. */
  crossovers: { a: string; b: string; lap: number; leader: string }[];
  summary: string[];
}

const LABELS: Record<keyof Components, string> = {
  baseSec: "Base pace",
  compoundSec: "Compound pace offsets",
  degradationSec: "Tyre degradation",
  cliffSec: "Past-cliff degradation",
  pitSec: "Pit-stop loss",
};

/** Deltas smaller than this are reported as equal. */
const EPS = 0.05;

export const fmtDelta = (s: number) => `${s >= 0 ? "+" : "−"}${Math.abs(s).toFixed(1)} s`;

function reason(key: keyof Components, delta: number, me: SimResult, ref: SimResult): string {
  const more = delta > 0;
  switch (key) {
    case "pitSec": {
      const diff = me.chargedStops - ref.chargedStops;
      if (diff !== 0) {
        return `${fmtDelta(delta)} pit loss — ${Math.abs(diff)} ${more ? "more" : "fewer"} charged stop${Math.abs(diff) === 1 ? "" : "s"} (${me.chargedStops} vs ${ref.chargedStops}).`;
      }
      return `${fmtDelta(delta)} pit loss.`;
    }
    case "degradationSec":
      return `${fmtDelta(delta)} from tyre wear — ${more ? "longer or higher-wear stints accumulate more" : "shorter or lower-wear stints keep tyres fresher"}.`;
    case "cliffSec":
      return `${fmtDelta(delta)} from running ${more ? "further" : "less far"} past the assumed tyre cliff.`;
    case "compoundSec":
      return `${fmtDelta(delta)} from compound pace — ${more ? "more laps on slower compounds" : "more laps on faster compounds"}.`;
    case "baseSec":
      return `${fmtDelta(delta)} base pace (should be zero for equal race distance).`;
  }
}

function crossovers(results: SimResult[], names: Map<string, string>) {
  const out: ComparisonReport["crossovers"] = [];
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i];
      const b = results[j];
      let prevSign = 0;
      const n = Math.min(a.laps.length, b.laps.length);
      for (let k = 0; k < n; k++) {
        const d = a.laps[k].cumulativeSec - b.laps[k].cumulativeSec;
        const sign = Math.abs(d) < 1e-9 ? 0 : Math.sign(d);
        if (sign !== 0 && prevSign !== 0 && sign !== prevSign) {
          out.push({ a: a.strategyId, b: b.strategyId, lap: a.laps[k].lap, leader: (sign < 0 ? names.get(a.strategyId) : names.get(b.strategyId)) ?? "" });
        }
        if (sign !== 0) prevSign = sign;
      }
    }
  }
  return out;
}

/**
 * Compare simulated strategies. Everything is a pure function of the results, so the
 * explanation is exactly the arithmetic difference of the model's components.
 */
export function compareStrategies(strategies: Strategy[], results: SimResult[]): ComparisonReport {
  const names = new Map(strategies.map((s) => [s.id, s.name]));
  const valid = results.filter((r): r is SimResult & { totalSec: number; components: Components } => r.ok && r.totalSec != null && r.components != null);
  if (valid.length === 0) return { fastestId: null, rows: [], crossovers: [], summary: [] };

  const sorted = [...valid].sort((a, b) => a.totalSec - b.totalSec || a.strategyId.localeCompare(b.strategyId));
  const ref = sorted[0];

  const rows: StrategyComparison[] = sorted.map((r, idx) => {
    const deltas = (Object.keys(LABELS) as (keyof Components)[]).map((key) => ({
      key,
      label: LABELS[key],
      deltaSec: Math.round((r.components[key] - ref.components[key]) * 1000) / 1000,
    }));
    const gapSec = Math.round((r.totalSec - ref.totalSec) * 1000) / 1000;
    const explanation =
      idx === 0
        ? ["Fastest under the current assumptions — the reference for the gaps below."]
        : [...deltas]
            .filter((d) => Math.abs(d.deltaSec) >= EPS)
            .sort((a, b) => Math.abs(b.deltaSec) - Math.abs(a.deltaSec))
            .map((d) => reason(d.key, d.deltaSec, r, ref));
    if (idx > 0 && explanation.length === 0) explanation.push("Identical total within 0.05 s.");
    return { strategyId: r.strategyId, name: names.get(r.strategyId) ?? r.strategyId, rank: idx + 1, totalSec: r.totalSec, gapSec, deltas, explanation };
  });

  const cross = crossovers(valid, names);
  const summary: string[] = [];
  if (rows.length > 1) {
    const [first, second] = rows;
    summary.push(`${first.name} is fastest, ${second.gapSec.toFixed(1)} s ahead of ${second.name}.`);
    const biggest = [...second.deltas].sort((a, b) => Math.abs(b.deltaSec) - Math.abs(a.deltaSec))[0];
    if (biggest && Math.abs(biggest.deltaSec) >= EPS) {
      summary.push(`The largest single factor is ${biggest.label.toLowerCase()} (${fmtDelta(biggest.deltaSec)} for ${second.name}).`);
    }
  }
  // Keep the narrative short: only flips involving the fastest strategy, at most three.
  for (const c of cross.filter((x) => x.a === ref.strategyId || x.b === ref.strategyId).slice(0, 3)) {
    summary.push(`Cumulative order between ${names.get(c.a)} and ${names.get(c.b)} flips on lap ${c.lap} (${c.leader} ahead after).`);
  }
  return { fastestId: ref.strategyId, rows, crossovers: cross, summary };
}
