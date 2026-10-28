import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { INDEX_PATH, MODULE_PATH, RACES_DIR, buildRegistry } from "../../../scripts/generate-race-registry";
import { makeRace } from "@/test/fixtures";
import { REGISTERED_RACE_FILES, REGISTERED_RACE_IDS } from "./race-registry.generated";
import { LOCAL_RACE_IDS, createLocalRepository, raceRepository } from "./repository";

const BUNDLED = ["2024-01-bahrain", "2024-04-japan", "2024-16-italy"];

describe("generated race registry (bundled datasets)", () => {
  it("is up to date with data/races (run `npm run registry:generate` if this fails)", () => {
    const build = buildRegistry(RACES_DIR);
    if (!build.ok) throw new Error(build.errors.join("\n"));
    expect(readFileSync(MODULE_PATH, "utf8")).toBe(build.moduleSource);
    expect(readFileSync(INDEX_PATH, "utf8")).toBe(build.indexJson);
  });

  it("registers exactly the bundled race files, in code-point order", () => {
    const files = readdirSync(RACES_DIR).map((f) => f.replace(/\.json$/, ""));
    expect([...REGISTERED_RACE_IDS]).toEqual([...files].sort());
    expect([...REGISTERED_RACE_IDS]).toEqual(BUNDLED);
    expect(Object.keys(REGISTERED_RACE_FILES)).toEqual(BUNDLED);
    expect([...LOCAL_RACE_IDS]).toEqual(BUNDLED);
  });

  it("serves every registered race under its own id, and lists them all", async () => {
    for (const id of REGISTERED_RACE_IDS) {
      const res = await raceRepository.getRace(id);
      expect(res.ok && res.race.id, id).toBe(id);
    }
    expect((await raceRepository.listRaces()).map((r) => r.id)).toEqual(BUNDLED);
  });

  it("is deterministic regardless of directory listing order", () => {
    const a = buildRegistry(RACES_DIR, (n) => [...n].sort());
    const b = buildRegistry(RACES_DIR, (n) => [...n].sort().reverse());
    const c = buildRegistry(RACES_DIR);
    expect(a.ok && b.ok && c.ok).toBe(true);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});

describe("registry generation failures (temporary fixtures; bundled data is never touched)", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  /** A temp data/races directory containing the given files (objects are JSON-encoded). */
  function fixtureDir(files: Record<string, unknown>): string {
    const dir = mkdtempSync(path.join(tmpdir(), "apexstint-registry-"));
    dirs.push(dir);
    for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), typeof content === "string" ? content : JSON.stringify(content));
    return dir;
  }
  const race = (id: string) => ({ ...makeRace(), id });
  const errorsFor = (files: Record<string, unknown>) => {
    const build = buildRegistry(fixtureDir(files));
    expect(build.ok).toBe(false);
    return build.ok ? [] : build.errors;
  };

  it("accepts a valid fixture and renders imports, ids and index", () => {
    const build = buildRegistry(fixtureDir({ "b-race.json": race("b-race"), "a-race.json": race("a-race") }));
    if (!build.ok) throw new Error(build.errors.join("\n"));
    expect(build.entries.map((e) => e.id)).toEqual(["a-race", "b-race"]);
    expect(build.moduleSource).toContain('import race_a_race from "../../../data/races/a-race.json";');
    expect(JSON.parse(build.indexJson).map((e: { id: string }) => e.id)).toEqual(["a-race", "b-race"]);
  });

  it("rejects malformed JSON", () => {
    expect(errorsFor({ "a-race.json": "{ not json" })[0]).toMatch(/^a-race\.json: invalid JSON/);
  });

  it("rejects a dataset that fails the race schema", () => {
    const missingDrivers = Object.fromEntries(Object.entries(race("a-race")).filter(([k]) => k !== "drivers"));
    expect(errorsFor({ "a-race.json": missingDrivers })[0]).toMatch(/^a-race\.json: fails the race schema — drivers:/);
  });

  it("rejects a dataset whose declared id differs from its filename (route)", () => {
    expect(errorsFor({ "a-race.json": race("b-race") })).toEqual(['a-race.json: declares id "b-race" but its filename (and route) is "a-race"']);
  });

  it("rejects duplicate registrations of one id", () => {
    // Filenames are unique and must equal the declared id, so a second file declaring the same
    // id is caught as an id/filename mismatch (the explicit duplicate check is defence in depth).
    const errors = errorsFor({ "a-race.json": race("a-race"), "b-race.json": race("a-race") });
    expect(errors).toEqual(['b-race.json: declares id "a-race" but its filename (and route) is "b-race"']);
  });

  it("rejects filenames that are not valid race ids", () => {
    for (const bad of ["Bad_ID.json", "a--race.json", "-a.json", "a race.json"]) {
      expect(errorsFor({ [bad]: race("x") })[0]).toMatch(/filename must be a lowercase race id/);
    }
  });

  it("rejects unexpected files", () => {
    expect(errorsFor({ "a-race.json": race("a-race"), "notes.txt": "hi" })).toEqual([
      "notes.txt: unexpected file in data/races (only <race-id>.json files are allowed)",
    ]);
  });

  it("rejects an empty or missing directory", () => {
    expect(errorsFor({})[0]).toMatch(/no race datasets found/);
    expect(buildRegistry(path.join(tmpdir(), "apexstint-does-not-exist-" + process.pid))).toMatchObject({ ok: false });
  });

  it("reports every problem, not just the first", () => {
    expect(errorsFor({ "a-race.json": "{", "b-race.json": race("c-race"), "x.txt": "" })).toHaveLength(3);
  });
});

describe("repository identity check", () => {
  it("refuses to serve a payload under a key that differs from its declared id", async () => {
    const repo = createLocalRepository({ "2024-01-bahrain": REGISTERED_RACE_FILES["2024-16-italy"] });
    expect(await repo.getRace("2024-01-bahrain")).toEqual({
      ok: false,
      reason: "invalid",
      issues: ['registered as "2024-01-bahrain" but the dataset declares id "2024-16-italy"'],
    });
    expect(await repo.listRaces()).toEqual([]);
  });

  it("returns not-found for unregistered ids, including prototype keys", async () => {
    for (const id of ["1999-01-nowhere", "__proto__", "constructor", "toString"]) {
      expect(await raceRepository.getRace(id)).toEqual({ ok: false, reason: "not-found" });
    }
  });
});
