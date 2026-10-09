import { z } from "zod";

/**
 * Runtime schema for a bundled race file (data/races/*.json).
 * Every value that a source may omit is nullable so the UI is forced to handle it.
 */

export const COMPOUNDS = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const;
export const compoundSchema = z.enum(COMPOUNDS);

const positiveInt = z.number().int().positive();
const nonNegInt = z.number().int().nonnegative();
const ms = z.number().int().positive();

export const sourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  license: z.string().min(1),
  fields: z.array(z.string()).min(1),
  retrievedAt: z.string().datetime(),
});

export const driverSchema = z.object({
  driverId: z.string().min(1),
  code: z.string().min(2).max(4),
  number: positiveInt,
  givenName: z.string(),
  familyName: z.string(),
  team: z.string(),
  teamId: z.string(),
});

export const resultSchema = z.object({
  driverId: z.string(),
  position: positiveInt,
  positionText: z.string(),
  grid: nonNegInt.nullable(),
  laps: nonNegInt,
  status: z.string(),
  points: z.number().nonnegative(),
  timeMs: ms.nullable(),
  fastestLapRank: positiveInt.nullable(),
});

export const lapSchema = z.object({
  driverId: z.string(),
  lap: positiveInt,
  position: positiveInt.nullable(),
  timeMs: ms.nullable(),
});

export const pitStopSchema = z.object({
  driverId: z.string(),
  stop: positiveInt,
  lap: positiveInt,
  durationMs: ms.nullable(),
});

export const stintSchema = z.object({
  driverId: z.string(),
  stint: positiveInt,
  lapStart: positiveInt.nullable(),
  lapEnd: positiveInt.nullable(),
  compound: compoundSchema.nullable(),
  tyreAgeAtStart: nonNegInt.nullable(),
});

export const raceSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9-]+$/),
    /** "historical" = recorded data from a source; "demo" = explicitly synthetic. */
    kind: z.enum(["historical", "demo"]),
    season: z.number().int().min(1950),
    round: positiveInt,
    raceName: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    circuit: z.object({ name: z.string(), locality: z.string(), country: z.string() }),
    scheduledLaps: positiveInt,
    sources: z.array(sourceSchema).min(1),
    missingFields: z.array(z.string()),
    notes: z.array(z.string()).default([]),
    drivers: z.array(driverSchema).min(1),
    results: z.array(resultSchema),
    laps: z.array(lapSchema),
    pitStops: z.array(pitStopSchema),
    stints: z.array(stintSchema),
  })
  .superRefine((race, ctx) => {
    const ids = new Set(race.drivers.map((d) => d.driverId));
    if (ids.size !== race.drivers.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate driverId in drivers" });
    }
    const check = (arr: { driverId: string }[], name: string) => {
      arr.forEach((row, i) => {
        if (!ids.has(row.driverId)) {
          ctx.addIssue({ code: "custom", path: [name, i, "driverId"], message: `Unknown driver ${row.driverId}` });
        }
      });
    };
    check(race.results, "results");
    check(race.laps, "laps");
    check(race.pitStops, "pitStops");
    check(race.stints, "stints");

    race.laps.forEach((l, i) => {
      if (l.lap > race.scheduledLaps) {
        ctx.addIssue({ code: "custom", path: ["laps", i, "lap"], message: `Lap ${l.lap} exceeds scheduledLaps` });
      }
    });
    race.stints.forEach((s, i) => {
      if (s.lapEnd != null && s.lapEnd > race.scheduledLaps) {
        ctx.addIssue({ code: "custom", path: ["stints", i, "lapEnd"], message: "Stint ends after race distance" });
      }
      if (s.lapStart != null && s.lapEnd != null && s.lapEnd < s.lapStart) {
        ctx.addIssue({ code: "custom", path: ["stints", i], message: "Stint lapEnd < lapStart" });
      }
    });
  });

export type Compound = z.infer<typeof compoundSchema>;
export type Race = z.infer<typeof raceSchema>;
export type Driver = z.infer<typeof driverSchema>;
export type RaceResult = z.infer<typeof resultSchema>;
export type LapRecord = z.infer<typeof lapSchema>;
export type PitStop = z.infer<typeof pitStopSchema>;
export type Stint = z.infer<typeof stintSchema>;
export type DataSource = z.infer<typeof sourceSchema>;

export const raceIndexSchema = z.array(
  z.object({ id: z.string(), season: z.number().int(), round: positiveInt, raceName: z.string() }),
);

/**
 * Soft consistency checks that do not make a file invalid but are worth surfacing
 * (e.g. the two sources disagreeing). Returned as human-readable warnings.
 */
export function consistencyWarnings(race: Race): string[] {
  const warnings: string[] = [];
  for (const d of race.drivers) {
    const stints = race.stints.filter((s) => s.driverId === d.driverId).sort((a, b) => a.stint - b.stint);
    const stops = race.pitStops.filter((p) => p.driverId === d.driverId);
    // A stint change should coincide with a recorded pit stop (the stint ends on the in-lap).
    for (let i = 0; i < stints.length - 1; i++) {
      const end = stints[i].lapEnd;
      if (end == null) continue;
      if (!stops.some((p) => Math.abs(p.lap - end) <= 1)) {
        warnings.push(`${d.code}: stint ${stints[i].stint} ends on lap ${end} but no pit stop is recorded near that lap`);
      }
    }
  }
  return warnings;
}
