import { describe, expect, it } from "vitest";
import { makeRace } from "@/test/fixtures";
import { classifyLaps, coverage, driverTimeline, driversByFinish, median, medianPitLaneMs, paceSummary } from "./derive";

describe("median", () => {
  it("handles empty, odd and even inputs", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("classifyLaps", () => {
  const race = makeRace();

  it("excludes lap 1, in/out laps and slow laps", () => {
    const laps = classifyLaps(race, "alpha");
    const byLap = Object.fromEntries(laps.map((l) => [l.lap, l.exclusions]));
    expect(byLap[1]).toContain("lap-1");
    expect(byLap[3]).toContain("in-lap");
    expect(byLap[3]).toContain("slow"); // 115 s vs ~91 s median
    expect(byLap[4]).toContain("out-lap");
    expect(laps.filter((l) => l.clean).map((l) => l.lap)).toEqual([2, 5, 6]);
  });

  it("marks missing times rather than dropping rows", () => {
    const laps = classifyLaps(race, "beta");
    expect(laps).toHaveLength(5);
    expect(laps.find((l) => l.lap === 3)!.exclusions).toContain("no-time");
  });

  it("returns an empty list for unknown drivers", () => {
    expect(classifyLaps(race, "nobody")).toEqual([]);
  });
});

describe("paceSummary", () => {
  it("summarises clean laps only", () => {
    const p = paceSummary(makeRace(), "alpha");
    expect(p.cleanLapCount).toBe(3);
    expect(p.medianCleanMs).toBe(90_500);
    expect(p.bestCleanMs).toBe(90_000);
  });

  it("returns nulls when no clean laps exist", () => {
    const p = paceSummary(makeRace({ laps: [] }), "alpha");
    expect(p.medianCleanMs).toBeNull();
    expect(p.bestCleanMs).toBeNull();
  });
});

describe("medianPitLaneMs", () => {
  it("ignores stoppage-length pit visits", () => {
    expect(medianPitLaneMs(makeRace())).toBe(22_000);
  });
  it("is null with no pit data", () => {
    expect(medianPitLaneMs(makeRace({ pitStops: [] }))).toBeNull();
  });
});

describe("driverTimeline", () => {
  it("uses recorded stints when present", () => {
    const t = driverTimeline(makeRace(), "alpha");
    expect(t.map((s) => [s.lapStart, s.lapEnd, s.compound, s.origin])).toEqual([
      [1, 3, "SOFT", "stints"],
      [4, 6, "HARD", "stints"],
    ]);
  });

  it("falls back to pit-stop laps with unknown compound", () => {
    const t = driverTimeline(makeRace(), "beta");
    expect(t.map((s) => [s.lapStart, s.lapEnd, s.compound, s.origin])).toEqual([
      [1, 2, null, "pit-stops"],
      [3, 5, null, "pit-stops"],
    ]);
  });

  it("fills a missing final lapEnd from the result", () => {
    const race = makeRace();
    race.stints[1] = { ...race.stints[1], lapEnd: null };
    expect(driverTimeline(race, "alpha").at(-1)!.lapEnd).toBe(6);
  });
});

describe("driversByFinish / coverage", () => {
  it("orders by position", () => {
    expect(driversByFinish(makeRace()).map((d) => d.driverId)).toEqual(["alpha", "beta"]);
  });
  it("counts coverage including nulls", () => {
    const c = coverage(makeRace());
    expect(c.lapRows).toBe(11);
    expect(c.lapRowsWithTime).toBe(10);
    expect(c.stoppagePitStops).toBe(1);
    expect(c.longPitStops).toBe(0);
    expect(c.driversWithStints).toBe(1);
  });
});
