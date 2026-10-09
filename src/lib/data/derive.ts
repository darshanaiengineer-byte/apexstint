import type { Compound, Driver, LapRecord, PitStop, Race } from "./schema";

/**
 * Pure, read-only views over a validated Race. Nothing here invents values:
 * every derived number is computed from recorded rows, and anything that
 * cannot be computed comes back as null.
 */

/**
 * Two different things show up as "long" pit-lane times and must not be conflated:
 *  - a slow but real stop (wheel-nut problem, repair, penalty): over a minute;
 *  - a race suspension (red flag), where cars sit in the pit lane for many minutes.
 * Only the second is "not a normal stop". Real stops of any length still count as stops.
 */
export const LONG_PIT_MS = 60_000;
export const STOPPAGE_PIT_MS = 10 * 60_000;
/** Laps slower than this fraction of the driver's median are treated as non-representative. */
export const OUTLIER_FACTOR = 1.07;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function driverMap(race: Race): Map<string, Driver> {
  return new Map(race.drivers.map((d) => [d.driverId, d]));
}

export function driverLaps(race: Race, driverId: string): LapRecord[] {
  return race.laps.filter((l) => l.driverId === driverId).sort((a, b) => a.lap - b.lap);
}

export function driverPitStops(race: Race, driverId: string): PitStop[] {
  return race.pitStops.filter((p) => p.driverId === driverId).sort((a, b) => a.stop - b.stop);
}

/** Pit-lane visit spanning a race suspension (red flag): not a normal stop. */
export function isStoppagePit(p: PitStop): boolean {
  return p.durationMs != null && p.durationMs > STOPPAGE_PIT_MS;
}

/** A real stop that took unusually long (> 60 s): counted, but kept out of the pit-loss median. */
export function isLongPit(p: PitStop): boolean {
  return p.durationMs != null && p.durationMs > LONG_PIT_MS && !isStoppagePit(p);
}

export type LapExclusion = "lap-1" | "in-lap" | "out-lap" | "slow" | "no-time";

export interface ClassifiedLap extends LapRecord {
  exclusions: LapExclusion[];
  clean: boolean;
}

/**
 * Tag each recorded lap with reasons it is not representative of green-flag pace:
 * lap 1 (standing start), in/out laps around a recorded pit stop, laps more than
 * 7% slower than the driver's median (Safety Car, VSC, red flag, incidents) and
 * laps with no time.
 */
export function classifyLaps(race: Race, driverId: string): ClassifiedLap[] {
  const laps = driverLaps(race, driverId);
  const stops = driverPitStops(race, driverId);
  const inLaps = new Set(stops.map((p) => p.lap));
  const outLaps = new Set(stops.map((p) => p.lap + 1));
  const med = median(laps.flatMap((l) => (l.timeMs != null ? [l.timeMs] : [])));

  return laps.map((l) => {
    const exclusions: LapExclusion[] = [];
    if (l.timeMs == null) exclusions.push("no-time");
    if (l.lap === 1) exclusions.push("lap-1");
    if (inLaps.has(l.lap)) exclusions.push("in-lap");
    if (outLaps.has(l.lap)) exclusions.push("out-lap");
    if (l.timeMs != null && med != null && l.timeMs > med * OUTLIER_FACTOR) exclusions.push("slow");
    return { ...l, exclusions, clean: exclusions.length === 0 };
  });
}

export interface PaceSummary {
  cleanLapCount: number;
  totalLapCount: number;
  medianCleanMs: number | null;
  bestCleanMs: number | null;
}

export function paceSummary(race: Race, driverId: string): PaceSummary {
  const classified = classifyLaps(race, driverId);
  const clean = classified.filter((l) => l.clean).map((l) => l.timeMs as number);
  return {
    cleanLapCount: clean.length,
    totalLapCount: classified.length,
    medianCleanMs: median(clean),
    bestCleanMs: clean.length ? Math.min(...clean) : null,
  };
}

/** Median recorded pit-lane duration of routine stops (stoppages and > 60 s stops excluded). */
export function medianPitLaneMs(race: Race): number | null {
  return median(race.pitStops.filter((p) => p.durationMs != null && p.durationMs <= LONG_PIT_MS).map((p) => p.durationMs as number));
}

export interface TimelineSegment {
  stint: number;
  lapStart: number;
  lapEnd: number;
  compound: Compound | null;
  tyreAgeAtStart: number | null;
  /** "stints" = from the stint feed; "pit-stops" = derived from pit-stop laps only, compound unknown. */
  origin: "stints" | "pit-stops";
}

/**
 * The tyre timeline for a driver. Uses the recorded stint feed when present;
 * otherwise falls back to segments bounded by recorded pit-stop laps, with the
 * compound left unknown rather than guessed.
 */
export function driverTimeline(race: Race, driverId: string): TimelineSegment[] {
  const lapsDone = race.results.find((r) => r.driverId === driverId)?.laps ?? null;
  const stints = race.stints.filter((s) => s.driverId === driverId).sort((a, b) => a.stint - b.stint);
  if (stints.length > 0) {
    return stints.flatMap((s, i) => {
      const lapStart = s.lapStart ?? (i === 0 ? 1 : null);
      const lapEnd = s.lapEnd ?? (i === stints.length - 1 ? lapsDone : null);
      if (lapStart == null || lapEnd == null || lapEnd < lapStart) return [];
      return [{ stint: s.stint, lapStart, lapEnd, compound: s.compound, tyreAgeAtStart: s.tyreAgeAtStart, origin: "stints" as const }];
    });
  }
  if (!lapsDone) return [];
  const stops = driverPitStops(race, driverId).filter((p) => p.lap < lapsDone);
  const bounds = [0, ...stops.map((p) => p.lap), lapsDone];
  const segments: TimelineSegment[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    if (bounds[i + 1] <= bounds[i]) continue;
    segments.push({
      stint: i + 1,
      lapStart: bounds[i] + 1,
      lapEnd: bounds[i + 1],
      compound: null,
      tyreAgeAtStart: null,
      origin: "pit-stops",
    });
  }
  return segments;
}

/** Drivers ordered by classified finishing position (drivers without a result last). */
export function driversByFinish(race: Race): Driver[] {
  const pos = new Map(race.results.map((r) => [r.driverId, r.position]));
  return [...race.drivers].sort((a, b) => (pos.get(a.driverId) ?? 999) - (pos.get(b.driverId) ?? 999));
}

export interface Coverage {
  drivers: number;
  results: number;
  lapRows: number;
  lapRowsWithTime: number;
  driversWithLaps: number;
  pitStops: number;
  pitStopsWithDuration: number;
  stoppagePitStops: number;
  longPitStops: number;
  stints: number;
  stintsWithCompound: number;
  driversWithStints: number;
}

export function coverage(race: Race): Coverage {
  return {
    drivers: race.drivers.length,
    results: race.results.length,
    lapRows: race.laps.length,
    lapRowsWithTime: race.laps.filter((l) => l.timeMs != null).length,
    driversWithLaps: new Set(race.laps.map((l) => l.driverId)).size,
    pitStops: race.pitStops.length,
    pitStopsWithDuration: race.pitStops.filter((p) => p.durationMs != null).length,
    stoppagePitStops: race.pitStops.filter(isStoppagePit).length,
    longPitStops: race.pitStops.filter(isLongPit).length,
    stints: race.stints.length,
    stintsWithCompound: race.stints.filter((s) => s.compound != null).length,
    driversWithStints: new Set(race.stints.map((s) => s.driverId)).size,
  };
}
