import { describe, expect, it } from "vitest";
import { compareStrategies } from "./compare";
import { defaultAssumptions, simulate, type Strategy } from "./model";

const a = defaultAssumptions(90, 20);
a.compounds.SOFT = { paceOffsetSec: -1, degSecPerLap: 0.3, cliffAfterLaps: null, cliffSecPerLap: 0 };
a.compounds.HARD = { paceOffsetSec: 0.5, degSecPerLap: 0.05, cliffAfterLaps: null, cliffSecPerLap: 0 };
a.compounds.MEDIUM = { paceOffsetSec: 0, degSecPerLap: 0.1, cliffAfterLaps: null, cliffSecPerLap: 0 };

const stint = (compound: "SOFT" | "MEDIUM" | "HARD", laps: number) => ({ compound, laps, tyreAgeAtStart: 0, freeStop: false });
const one: Strategy = { id: "a", name: "One", stints: [stint("MEDIUM", 20), stint("HARD", 20)] };
const two: Strategy = { id: "b", name: "Two", stints: [stint("SOFT", 13), stint("SOFT", 13), stint("HARD", 14)] };

describe("compareStrategies", () => {
  const results = [simulate(one, a, 40), simulate(two, a, 40)];
  const report = compareStrategies([one, two], results);

  it("ranks by total and gaps equal the sum of component deltas", () => {
    expect(report.rows).toHaveLength(2);
    const slow = report.rows[1];
    const sum = slow.deltas.reduce((acc, d) => acc + d.deltaSec, 0);
    expect(sum).toBeCloseTo(slow.gapSec, 2);
    expect(report.rows[0].gapSec).toBe(0);
    expect(report.rows[0].totalSec).toBeLessThanOrEqual(report.rows[1].totalSec);
  });

  it("explains the stop-count difference", () => {
    const slower = report.rows[1];
    const text = slower.explanation.join(" ");
    expect(text).toMatch(slower.strategyId === "b" ? /1 more charged stop \(2 vs 1\)/ : /1 fewer charged stop \(1 vs 2\)/);
  });

  it("detects cumulative crossovers", () => {
    // The two-stop is faster early on softs, then pays its extra stop: the order flips at least once.
    expect(report.crossovers.length).toBeGreaterThan(0);
    for (const c of report.crossovers) expect(c.lap).toBeGreaterThan(1);
  });

  it("ignores invalid results", () => {
    const bad: Strategy = { id: "c", name: "Bad", stints: [stint("SOFT", 3)] };
    const r = compareStrategies([one, bad], [simulate(one, a, 40), simulate(bad, a, 40)]);
    expect(r.rows.map((x) => x.strategyId)).toEqual(["a"]);
    expect(r.summary).toEqual([]);
  });

  it("handles no valid results", () => {
    expect(compareStrategies([], []).fastestId).toBeNull();
  });
});
