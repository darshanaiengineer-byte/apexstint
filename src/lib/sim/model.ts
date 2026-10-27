import { COMPOUNDS, type Compound } from "@/lib/data/schema";
import { LIMITS, MAX_STINTS, inRange, rangeError, type Range } from "./contract";

export { MAX_STINTS };

/**
 * ApexStint strategy model — deterministic, additive and deliberately simple.
 *
 * For lap j (1-based) of a stint on compound c, fitted with tyres that had
 * already done a0 laps, the tyre age is a = a0 + (j − 1) and
 *
 *   lapTime = B + Δc + d_c · a + k_c · max(0, a − L_c + 1)
 *
 *   B   base lap time (s)                — user input, defaulted from recorded laps
 *   Δc  compound pace offset (s)         — hypothetical assumption
 *   d_c linear degradation (s per lap)   — hypothetical assumption
 *   L_c laps before the "cliff"          — hypothetical assumption (null = no cliff)
 *   k_c extra degradation past the cliff — hypothetical assumption
 *
 *   totalTime = Σ lapTime + P · (number of charged stops)
 *
 *   P   pit loss per stop (s)            — user input, defaulted from recorded pit-lane times
 *
 * Not modelled: fuel burn (it shifts every strategy equally), traffic, Safety Cars,
 * weather, track evolution, driver errors and tyre warm-up. This is an
 * explainable what-if calculator, not a team's race model.
 */

export interface CompoundModel {
  paceOffsetSec: number;
  degSecPerLap: number;
  cliffAfterLaps: number | null;
  cliffSecPerLap: number;
}

export interface Assumptions {
  baseLapSec: number;
  pitLossSec: number;
  compounds: Record<Compound, CompoundModel>;
}

export interface StrategyStint {
  compound: Compound;
  laps: number;
  /** Laps already on the set when fitted (e.g. used qualifying tyres). */
  tyreAgeAtStart: number;
  /** The stop *into* this stint costs no pit loss (e.g. tyres changed under a red flag). Ignored on stint 1. */
  freeStop: boolean;
}

export interface Strategy {
  id: string;
  name: string;
  stints: StrategyStint[];
}

export interface SimLap {
  lap: number;
  stint: number;
  compound: Compound;
  tyreAge: number;
  lapSec: number;
  /** Pit loss charged at the end of this lap (in-lap), 0 otherwise. */
  pitSec: number;
  cumulativeSec: number;
}

export interface Components {
  baseSec: number;
  compoundSec: number;
  degradationSec: number;
  cliffSec: number;
  pitSec: number;
}

export interface SimResult {
  strategyId: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
  totalSec: number | null;
  components: Components | null;
  laps: SimLap[];
  stopLaps: number[];
  chargedStops: number;
}

/**
 * Version of the model's formulas and semantics. Bump it whenever a change could alter the
 * output for an already-valid input; it is part of every experiment id, so old results stay
 * distinguishable. (Rejecting previously-accepted invalid input does not require a bump.)
 */
export const MODEL_VERSION = "1.0.0";

export const DRY_COMPOUNDS: Compound[] = ["SOFT", "MEDIUM", "HARD"];

/** Validation that blocks a simulation (errors) or merely informs (warnings). */
export function validateStrategy(strategy: Strategy, totalLaps: number): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { stints } = strategy;

  if (!Number.isInteger(totalLaps) || totalLaps < 1) errors.push(`Race distance must be a whole number of laps ≥ 1 (got ${totalLaps}).`);
  if (stints.length === 0) errors.push("Add at least one stint.");
  if (stints.length > MAX_STINTS) errors.push(`Use at most ${MAX_STINTS} stints.`);
  stints.forEach((s, i) => {
    if (!COMPOUNDS.includes(s.compound)) errors.push(`Stint ${i + 1}: unknown compound "${String(s.compound)}".`);
    if (!inRange(s.laps, LIMITS.stintLaps)) errors.push(rangeError(s.laps, LIMITS.stintLaps, `Stint ${i + 1}: ${LIMITS.stintLaps.label}`));
    if (!inRange(s.tyreAgeAtStart, LIMITS.tyreAgeAtStart))
      errors.push(rangeError(s.tyreAgeAtStart, LIMITS.tyreAgeAtStart, `Stint ${i + 1}: ${LIMITS.tyreAgeAtStart.label}`));
    // A non-boolean would be coerced (e.g. "no" is truthy) and silently waive the pit loss.
    if (typeof s.freeStop !== "boolean") errors.push(`Stint ${i + 1}: free stop must be true or false (got ${String(s.freeStop)}).`);
  });
  const sum = stints.reduce((acc, s) => acc + (Number.isFinite(s.laps) ? s.laps : 0), 0);
  if (stints.length > 0 && sum !== totalLaps) {
    errors.push(`Stints cover ${sum} laps but the race is ${totalLaps} laps (${sum > totalLaps ? "remove" : "add"} ${Math.abs(totalLaps - sum)}).`);
  }

  const usesWet = stints.some((s) => !DRY_COMPOUNDS.includes(s.compound));
  const dryCompounds = new Set(stints.filter((s) => DRY_COMPOUNDS.includes(s.compound)).map((s) => s.compound));
  if (stints.length > 0 && !usesWet && dryCompounds.size < 2) {
    warnings.push("In a dry race the sporting regulations require at least two different dry compounds; this strategy uses one.");
  }
  if (usesWet) warnings.push("Intermediate/wet tyres are only meaningful in wet conditions; this dataset has no weather data.");
  return { errors, warnings };
}

/**
 * Validate the global inputs against the shared contract. Every value must be finite and in
 * range; a cliff onset may be null (no cliff). Returns human-readable errors (empty = valid).
 */
export function validateAssumptions(assumptions: Assumptions): string[] {
  const errors: string[] = [];
  // Hot path (runs on every simulation): plain predicates, no closures; messages built only on failure.
  if (!inRange(assumptions?.baseLapSec, LIMITS.baseLapSec)) errors.push(rangeError(assumptions?.baseLapSec, LIMITS.baseLapSec, LIMITS.baseLapSec.label));
  if (!inRange(assumptions?.pitLossSec, LIMITS.pitLossSec)) errors.push(rangeError(assumptions?.pitLossSec, LIMITS.pitLossSec, LIMITS.pitLossSec.label));
  for (const c of COMPOUNDS) {
    const m = assumptions?.compounds?.[c];
    if (!m) {
      errors.push(`Tyre model (${c.toLowerCase()}) is missing.`);
      continue;
    }
    if (!inRange(m.paceOffsetSec, LIMITS.paceOffsetSec)) errors.push(compoundError(c, m.paceOffsetSec, LIMITS.paceOffsetSec));
    if (!inRange(m.degSecPerLap, LIMITS.degSecPerLap)) errors.push(compoundError(c, m.degSecPerLap, LIMITS.degSecPerLap));
    if (m.cliffAfterLaps !== null && !inRange(m.cliffAfterLaps, LIMITS.cliffAfterLaps)) errors.push(compoundError(c, m.cliffAfterLaps, LIMITS.cliffAfterLaps));
    if (!inRange(m.cliffSecPerLap, LIMITS.cliffSecPerLap)) errors.push(compoundError(c, m.cliffSecPerLap, LIMITS.cliffSecPerLap));
  }
  return errors;
}

const compoundError = (c: Compound, value: unknown, range: Range) => rangeError(value, range, `Tyre model (${c.toLowerCase()}) ${range.label}`);

/** Time for a single lap under the model. Exposed for tests and the formula explainer. */
export function lapTime(model: CompoundModel, baseLapSec: number, tyreAge: number) {
  const deg = model.degSecPerLap * tyreAge;
  const cliff = model.cliffAfterLaps == null ? 0 : model.cliffSecPerLap * Math.max(0, tyreAge - model.cliffAfterLaps + 1);
  return { total: baseLapSec + model.paceOffsetSec + deg + cliff, offset: model.paceOffsetSec, deg, cliff };
}

/** Round to the millisecond so results are stable across platforms and in the UI. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function simulate(strategy: Strategy, assumptions: Assumptions, totalLaps: number): SimResult {
  const { errors, warnings } = validateStrategy(strategy, totalLaps);
  const empty: SimResult = {
    strategyId: strategy.id,
    ok: false,
    errors,
    warnings,
    totalSec: null,
    components: null,
    laps: [],
    stopLaps: [],
    chargedStops: 0,
  };
  if (errors.length > 0) return empty;
  const assumptionErrors = validateAssumptions(assumptions);
  if (assumptionErrors.length > 0) return { ...empty, errors: assumptionErrors };

  const comp: Components = { baseSec: 0, compoundSec: 0, degradationSec: 0, cliffSec: 0, pitSec: 0 };
  const laps: SimLap[] = [];
  const stopLaps: number[] = [];
  let chargedStops = 0;
  let cumulative = 0;
  let lapNo = 0;

  strategy.stints.forEach((stint, si) => {
    const model = assumptions.compounds[stint.compound];
    for (let j = 0; j < stint.laps; j++) {
      lapNo += 1;
      const age = stint.tyreAgeAtStart + j;
      const t = lapTime(model, assumptions.baseLapSec, age);
      comp.baseSec += assumptions.baseLapSec;
      comp.compoundSec += t.offset;
      comp.degradationSec += t.deg;
      comp.cliffSec += t.cliff;

      // Pit loss is charged on the in-lap: the last lap of every stint except the final one,
      // unless the next stint was fitted during a free stop.
      let pitSec = 0;
      const isInLap = j === stint.laps - 1 && si < strategy.stints.length - 1;
      if (isInLap) {
        stopLaps.push(lapNo);
        if (!strategy.stints[si + 1].freeStop) {
          pitSec = assumptions.pitLossSec;
          chargedStops += 1;
        }
      }
      comp.pitSec += pitSec;
      cumulative += t.total + pitSec;
      laps.push({ lap: lapNo, stint: si + 1, compound: stint.compound, tyreAge: age, lapSec: r3(t.total), pitSec, cumulativeSec: r3(cumulative) });
    }
    if (model.cliffAfterLaps != null && stint.tyreAgeAtStart + stint.laps > model.cliffAfterLaps) {
      warnings.push(
        `Stint ${si + 1} runs ${stint.compound.toLowerCase()} tyres to age ${stint.tyreAgeAtStart + stint.laps - 1}, past the assumed cliff at ${model.cliffAfterLaps} laps.`,
      );
    }
  });

  // Invariant: validated finite inputs must give a finite result. Fail closed if they ever don't.
  if (!Number.isFinite(cumulative)) return { ...empty, errors: ["Internal error: the simulation produced a non-finite race time."] };

  const components: Components = {
    baseSec: r3(comp.baseSec),
    compoundSec: r3(comp.compoundSec),
    degradationSec: r3(comp.degradationSec),
    cliffSec: r3(comp.cliffSec),
    pitSec: r3(comp.pitSec),
  };
  return {
    strategyId: strategy.id,
    ok: true,
    errors: [],
    warnings,
    totalSec: r3(cumulative),
    components,
    laps,
    stopLaps,
    chargedStops,
  };
}

/** Stop laps (in-laps) ↔ stint lengths, for the "edit by stop lap" control. */
export function stopLapsFromStints(stints: Pick<StrategyStint, "laps">[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < stints.length - 1; i++) {
    acc += stints[i].laps;
    out.push(acc);
  }
  return out;
}

/**
 * Move stop `index` to `lap`, adjusting only the two neighbouring stints so the
 * total distance is preserved. The lap is clamped so every stint keeps ≥ 1 lap.
 */
export function moveStop<T extends Pick<StrategyStint, "laps">>(stints: T[], index: number, lap: number): T[] {
  if (index < 0 || index >= stints.length - 1) return stints;
  const stops = stopLapsFromStints(stints);
  const prev = index === 0 ? 0 : stops[index - 1];
  const next = index === stops.length - 1 ? stints.reduce((a, s) => a + s.laps, 0) : stops[index + 1];
  const clamped = Math.min(Math.max(Math.round(lap), prev + 1), next - 1);
  const delta = clamped - stops[index];
  if (delta === 0) return stints;
  return stints.map((s, i) => {
    if (i === index) return { ...s, laps: s.laps + delta };
    if (i === index + 1) return { ...s, laps: s.laps - delta };
    return s;
  });
}

export const DEFAULT_COMPOUNDS: Record<Compound, CompoundModel> = {
  SOFT: { paceOffsetSec: -0.6, degSecPerLap: 0.1, cliffAfterLaps: 18, cliffSecPerLap: 0.25 },
  MEDIUM: { paceOffsetSec: 0, degSecPerLap: 0.06, cliffAfterLaps: 30, cliffSecPerLap: 0.2 },
  HARD: { paceOffsetSec: 0.4, degSecPerLap: 0.035, cliffAfterLaps: 45, cliffSecPerLap: 0.15 },
  INTERMEDIATE: { paceOffsetSec: 5, degSecPerLap: 0.15, cliffAfterLaps: 25, cliffSecPerLap: 0.3 },
  WET: { paceOffsetSec: 9, degSecPerLap: 0.1, cliffAfterLaps: 30, cliffSecPerLap: 0.3 },
};

export function defaultAssumptions(baseLapSec: number, pitLossSec: number): Assumptions {
  return {
    baseLapSec,
    pitLossSec,
    compounds: structuredClone(DEFAULT_COMPOUNDS),
  };
}

/** Split `totalLaps` into evenly sized stints on the given compounds. */
export function evenStints(totalLaps: number, compounds: Compound[]): StrategyStint[] {
  const n = compounds.length;
  const base = Math.floor(totalLaps / n);
  let rem = totalLaps - base * n;
  return compounds.map((compound) => {
    const extra = rem > 0 ? 1 : 0;
    rem -= extra;
    return { compound, laps: base + extra, tyreAgeAtStart: 0, freeStop: false };
  });
}
