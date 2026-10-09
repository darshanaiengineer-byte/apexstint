import type { Race } from "@/lib/data/schema";

/**
 * Synthetic TEST-ONLY race. Values are made up for unit tests and are never shown
 * in the app (the schema marks it kind: "demo").
 */
export function makeRace(overrides: Partial<Race> = {}): Race {
  const lapsFor = (driverId: string, times: (number | null)[]) =>
    times.map((timeMs, i) => ({ driverId, lap: i + 1, position: null, timeMs }));
  return {
    schemaVersion: 1,
    id: "test-race",
    kind: "demo",
    season: 2099,
    round: 1,
    raceName: "Test Grand Prix",
    date: "2099-01-01",
    circuit: { name: "Test Ring", locality: "Nowhere", country: "Testland" },
    scheduledLaps: 6,
    sources: [{ name: "fixture", url: "https://example.com", license: "test", fields: ["all"], retrievedAt: "2099-01-01T00:00:00.000Z" }],
    missingFields: [],
    notes: [],
    drivers: [
      { driverId: "alpha", code: "ALP", number: 1, givenName: "Al", familyName: "Pha", team: "Team A", teamId: "a" },
      { driverId: "beta", code: "BET", number: 2, givenName: "Be", familyName: "Ta", team: "Team B", teamId: "b" },
    ],
    results: [
      { driverId: "alpha", position: 1, positionText: "1", grid: 1, laps: 6, status: "Finished", points: 25, timeMs: 600_000, fastestLapRank: 1 },
      { driverId: "beta", position: 2, positionText: "2", grid: 2, laps: 5, status: "+1 Lap", points: 18, timeMs: null, fastestLapRank: null },
    ],
    laps: [
      ...lapsFor("alpha", [100_000, 90_000, 115_000, 92_000, 91_000, 90_500]),
      ...lapsFor("beta", [101_000, 95_000, null, 94_000, 200_000]),
    ],
    pitStops: [
      { driverId: "alpha", stop: 1, lap: 3, durationMs: 22_000 },
      { driverId: "beta", stop: 1, lap: 2, durationMs: 1_500_000 },
    ],
    stints: [
      { driverId: "alpha", stint: 1, lapStart: 1, lapEnd: 3, compound: "SOFT", tyreAgeAtStart: 2 },
      { driverId: "alpha", stint: 2, lapStart: 4, lapEnd: 6, compound: "HARD", tyreAgeAtStart: 0 },
    ],
    ...overrides,
  };
}
