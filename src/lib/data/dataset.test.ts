import { describe, expect, it } from "vitest";
import { makeRace } from "@/test/fixtures";
import { LOCAL_RACE_IDS, createLocalRepository, parseRace, raceRepository } from "./repository";
import { consistencyWarnings } from "./schema";
import { recordedDefaults, recordedStrategy } from "@/lib/sim/recorded";
import { coverage, isLongPit, isStoppagePit, medianPitLaneMs } from "./derive";

describe("bundled dataset", () => {
  it.each(LOCAL_RACE_IDS)("%s passes schema validation", async (id) => {
    const res = await raceRepository.getRace(id);
    if (!res.ok) throw new Error(JSON.stringify(res));
    expect(res.race.kind).toBe("historical");
    expect(res.race.id).toBe(id);
    expect(res.race.results.length).toBeGreaterThan(0);
  });

  it.each(LOCAL_RACE_IDS)("%s has stints that agree with pit-stop laps", async (id) => {
    const res = await raceRepository.getRace(id);
    if (!res.ok) throw new Error("invalid");
    expect(consistencyWarnings(res.race)).toEqual([]);
  });

  it("lists races sorted with winners", async () => {
    const list = await raceRepository.listRaces();
    expect(list.map((r) => r.id)).toEqual(LOCAL_RACE_IDS);
    expect(list.every((r) => r.winner)).toBe(true);
  });

  // Spot checks against the recorded data (2024 Bahrain GP, Verstappen: S–H–S, stops on laps 17 and 37).
  it("rebuilds a recorded strategy from real stints", async () => {
    const res = await raceRepository.getRace("2024-01-bahrain");
    if (!res.ok) throw new Error("invalid");
    const rec = recordedStrategy(res.race, "max_verstappen");
    expect(rec.ok && rec.stints.map((s) => [s.compound, s.laps])).toEqual([
      ["SOFT", 17],
      ["HARD", 20],
      ["SOFT", 20],
    ]);
  });

  it("marks red-flag tyre changes as free stops (2024 Japan)", async () => {
    const res = await raceRepository.getRace("2024-04-japan");
    if (!res.ok) throw new Error("invalid");
    const rec = recordedStrategy(res.race, "max_verstappen");
    expect(rec.ok).toBe(true);
    if (rec.ok) {
      expect(rec.stints[1].freeStop).toBe(true);
      expect(rec.stints.slice(2).every((s) => !s.freeStop)).toBe(true);
    }
  });
});

describe("long stops vs red-flag stoppages (regression)", () => {
  it("treats Bottas's 74.8 s 2024 Bahrain stop as a real, long stop", async () => {
    const res = await raceRepository.getRace("2024-01-bahrain");
    if (!res.ok) throw new Error("invalid");
    const stop = res.race.pitStops.find((p) => p.driverId === "bottas" && p.stop === 2)!;
    expect(stop.durationMs).toBe(74_773);
    expect(isLongPit(stop)).toBe(true);
    expect(isStoppagePit(stop)).toBe(false);
    const c = coverage(res.race);
    expect([c.longPitStops, c.stoppagePitStops]).toEqual([1, 0]);
  });

  it("does not make a slow stop free when rebuilding a recorded strategy", () => {
    const race = makeRace();
    race.pitStops[0] = { ...race.pitStops[0], durationMs: 75_000 };
    const rec = recordedStrategy(race, "alpha");
    expect(rec.ok && rec.stints[1].freeStop).toBe(false);
  });

  it("keeps long stops out of the pit-loss median", () => {
    const race = makeRace({
      pitStops: [
        { driverId: "alpha", stop: 1, lap: 3, durationMs: 22_000 },
        { driverId: "beta", stop: 1, lap: 2, durationMs: 24_000 },
        { driverId: "beta", stop: 2, lap: 4, durationMs: 75_000 },
      ],
    });
    expect(medianPitLaneMs(race)).toBe(23_000);
  });

  // Independent cross-check (computed separately with Python over the raw JSON):
  // VER Bahrain clean-lap median 95.529 s over 52 laps; routine pit-lane median 25.0 s.
  it("derives the published Bahrain defaults", async () => {
    const res = await raceRepository.getRace("2024-01-bahrain");
    if (!res.ok) throw new Error("invalid");
    expect(recordedDefaults(res.race, "max_verstappen")).toMatchObject({ baseLapSec: 95.529, pitLossSec: 25 });
    expect(res.race.laps.filter((l) => l.driverId === "max_verstappen").length).toBe(57);
  });
});

describe("repository error handling", () => {
  it("returns not-found for unknown ids", async () => {
    expect(await raceRepository.getRace("1900-01-nowhere")).toEqual({ ok: false, reason: "not-found" });
  });

  it("reports schema issues for invalid payloads and hides them from listings", async () => {
    const broken = { ...makeRace(), id: "broken", scheduledLaps: 2 };
    // Registered under its own declared id (the repository rejects key/id mismatches).
    const repo = createLocalRepository({ "test-race": makeRace(), broken });
    const res = await repo.getRace("broken");
    expect(res.ok).toBe(false);
    if (!res.ok && res.reason === "invalid") expect(res.issues.some((i) => i.includes("exceeds scheduledLaps"))).toBe(true);
    expect((await repo.listRaces()).map((r) => r.id)).toEqual(["test-race"]);
  });

  it("rejects unknown driver references", () => {
    const race = makeRace();
    race.laps.push({ driverId: "ghost", lap: 1, position: null, timeMs: 90_000 });
    expect(parseRace(race).ok).toBe(false);
  });

  it("rejects garbage", () => {
    expect(parseRace(null).ok).toBe(false);
    expect(parseRace({ schemaVersion: 2 }).ok).toBe(false);
  });
});

describe("recordedStrategy edge cases", () => {
  it("refuses drivers who did not complete the distance", () => {
    expect(recordedStrategy(makeRace(), "beta").ok).toBe(false);
  });
  it("refuses stints with unknown compounds", () => {
    const race = makeRace();
    race.stints[0] = { ...race.stints[0], compound: null };
    expect(recordedStrategy(race, "alpha")).toEqual({ ok: false, reason: "At least one stint has an unknown compound." });
  });
  it("keeps recorded tyre age at start", () => {
    const rec = recordedStrategy(makeRace(), "alpha");
    expect(rec.ok && rec.stints[0].tyreAgeAtStart).toBe(2);
  });
});
