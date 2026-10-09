import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOUNDS,
  defaultAssumptions,
  evenStints,
  lapTime,
  moveStop,
  simulate,
  stopLapsFromStints,
  validateStrategy,
  type Assumptions,
  type Strategy,
} from "./model";

/** Linear-only assumptions (no cliffs) so totals have a simple closed form. */
function linear(base = 90, pit = 20): Assumptions {
  const a = defaultAssumptions(base, pit);
  a.compounds.SOFT = { paceOffsetSec: -1, degSecPerLap: 0.2, cliffAfterLaps: null, cliffSecPerLap: 0 };
  a.compounds.MEDIUM = { paceOffsetSec: 0, degSecPerLap: 0.1, cliffAfterLaps: null, cliffSecPerLap: 0 };
  a.compounds.HARD = { paceOffsetSec: 0.5, degSecPerLap: 0.05, cliffAfterLaps: null, cliffSecPerLap: 0 };
  return a;
}

const strat = (stints: Strategy["stints"], id = "x"): Strategy => ({ id, name: id, stints });
const st = (compound: Strategy["stints"][number]["compound"], laps: number, tyreAgeAtStart = 0, freeStop = false) => ({
  compound,
  laps,
  tyreAgeAtStart,
  freeStop,
});

describe("lapTime", () => {
  it("applies base + offset + linear degradation", () => {
    const t = lapTime({ paceOffsetSec: -0.5, degSecPerLap: 0.1, cliffAfterLaps: null, cliffSecPerLap: 0 }, 90, 4);
    expect(t.total).toBeCloseTo(90 - 0.5 + 0.4, 10);
    expect(t.cliff).toBe(0);
  });

  it("adds cliff loss only once age reaches the cliff", () => {
    const m = { paceOffsetSec: 0, degSecPerLap: 0, cliffAfterLaps: 10, cliffSecPerLap: 0.5 };
    expect(lapTime(m, 90, 8).cliff).toBe(0);
    expect(lapTime(m, 90, 9).cliff).toBe(0);
    expect(lapTime(m, 90, 10).cliff).toBeCloseTo(0.5);
    expect(lapTime(m, 90, 12).cliff).toBeCloseTo(1.5);
  });
});

describe("simulate", () => {
  it("matches the closed-form total for a one-stop strategy", () => {
    const a = linear(90, 20);
    const r = simulate(strat([st("MEDIUM", 10), st("HARD", 10)]), a, 20);
    expect(r.ok).toBe(true);
    // base 20×90, offsets 10×0 + 10×0.5, deg 0.1·Σ0..9 + 0.05·Σ0..9, one stop
    const expected = 1800 + 5 + 0.1 * 45 + 0.05 * 45 + 20;
    expect(r.totalSec).toBeCloseTo(expected, 6);
    expect(r.components).toEqual({ baseSec: 1800, compoundSec: 5, degradationSec: 6.75, cliffSec: 0, pitSec: 20 });
    expect(r.stopLaps).toEqual([10]);
    expect(r.chargedStops).toBe(1);
  });

  it("charges pit loss on the in-lap and cumulative time is monotonic", () => {
    const r = simulate(strat([st("SOFT", 3), st("MEDIUM", 3)]), linear(), 6);
    expect(r.laps.map((l) => l.pitSec)).toEqual([0, 0, 20, 0, 0, 0]);
    for (let i = 1; i < r.laps.length; i++) expect(r.laps[i].cumulativeSec).toBeGreaterThan(r.laps[i - 1].cumulativeSec);
    expect(r.laps.at(-1)!.cumulativeSec).toBeCloseTo(r.totalSec!, 6);
  });

  it("uses starting tyre age for degradation", () => {
    const fresh = simulate(strat([st("SOFT", 5), st("HARD", 5)]), linear(), 10);
    const used = simulate(strat([st("SOFT", 5, 3), st("HARD", 5)]), linear(), 10);
    expect(used.totalSec! - fresh.totalSec!).toBeCloseTo(5 * 3 * 0.2, 6);
    expect(used.laps[0].tyreAge).toBe(3);
  });

  it("does not charge pit loss for a free stop", () => {
    const r = simulate(strat([st("MEDIUM", 1), st("MEDIUM", 4, 1, true), st("HARD", 5)]), linear(), 10);
    expect(r.stopLaps).toEqual([1, 5]);
    expect(r.chargedStops).toBe(1);
    expect(r.components!.pitSec).toBe(20);
  });

  it("returns errors instead of totals for invalid strategies", () => {
    const r = simulate(strat([st("MEDIUM", 10)]), linear(), 20);
    expect(r.ok).toBe(false);
    expect(r.totalSec).toBeNull();
    expect(r.errors[0]).toMatch(/cover 10 laps but the race is 20/);
  });

  it("rejects non-positive base lap", () => {
    const r = simulate(strat([st("MEDIUM", 5), st("HARD", 5)]), linear(0), 10);
    expect(r.ok).toBe(false);
  });

  it("reproduces the worked example on the methodology page", () => {
    const a = defaultAssumptions(95, 22);
    a.compounds.MEDIUM = { paceOffsetSec: 0, degSecPerLap: 0.06, cliffAfterLaps: null, cliffSecPerLap: 0 };
    a.compounds.HARD = { paceOffsetSec: 0.4, degSecPerLap: 0.035, cliffAfterLaps: null, cliffSecPerLap: 0 };
    const r = simulate(strat([st("MEDIUM", 20), st("HARD", 37)]), a, 57);
    expect(r.components).toEqual({ baseSec: 5415, compoundSec: 14.8, degradationSec: 34.71, cliffSec: 0, pitSec: 22 });
    expect(r.totalSec).toBe(5486.51);
  });

  it("is deterministic", () => {
    const a = defaultAssumptions(95.123, 22.5);
    const s = strat([st("SOFT", 18, 2), st("HARD", 20), st("MEDIUM", 19)]);
    expect(simulate(s, a, 57)).toEqual(simulate(s, a, 57));
  });

  it("warns past the cliff", () => {
    const r = simulate(strat([st("SOFT", 30), st("HARD", 27)]), defaultAssumptions(90, 20), 57);
    expect(r.ok).toBe(true);
    expect(r.components!.cliffSec).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.includes("past the assumed cliff"))).toBe(true);
  });
});

describe("validateStrategy", () => {
  it("warns when a dry strategy uses one compound", () => {
    const v = validateStrategy(strat([st("MEDIUM", 5), st("MEDIUM", 5)]), 10);
    expect(v.errors).toEqual([]);
    expect(v.warnings[0]).toMatch(/two different dry compounds/);
  });

  it("flags empty and fractional stints", () => {
    expect(validateStrategy(strat([]), 10).errors).toContain("Add at least one stint.");
    expect(validateStrategy(strat([st("SOFT", 4.5), st("HARD", 5.5)]), 10).errors.length).toBeGreaterThan(0);
  });
});

describe("stop helpers", () => {
  it("converts stints to stop laps", () => {
    expect(stopLapsFromStints([{ laps: 10 }, { laps: 20 }, { laps: 27 }])).toEqual([10, 30]);
  });

  it("moves a stop while preserving distance and clamping", () => {
    const s = [{ laps: 10 }, { laps: 20 }, { laps: 27 }];
    expect(moveStop(s, 0, 15).map((x) => x.laps)).toEqual([15, 15, 27]);
    expect(moveStop(s, 1, 100).map((x) => x.laps)).toEqual([10, 46, 1]);
    expect(moveStop(s, 0, -4).map((x) => x.laps)).toEqual([1, 29, 27]);
  });

  it("splits laps evenly", () => {
    expect(evenStints(57, ["SOFT", "HARD", "MEDIUM"]).map((s) => s.laps)).toEqual([19, 19, 19]);
    expect(evenStints(53, ["MEDIUM", "HARD"]).map((s) => s.laps)).toEqual([27, 26]);
  });

  it("default assumptions are a copy", () => {
    const a = defaultAssumptions(90, 20);
    a.compounds.SOFT.degSecPerLap = 99;
    expect(DEFAULT_COMPOUNDS.SOFT.degSecPerLap).not.toBe(99);
  });
});
