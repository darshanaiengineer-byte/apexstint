#!/usr/bin/env node
/**
 * Builds the local ApexStint dataset from two open, non-commercial data sources:
 *
 *   - Jolpica-F1 (Ergast-compatible API)  https://github.com/jolpica/jolpica-f1
 *       results, lap-by-lap timings, pit stops          (CC BY-NC-SA 4.0)
 *   - OpenF1                               https://openf1.org
 *       tyre stints (compound, start/end lap, tyre age) (CC BY-NC-SA 4.0)
 *
 * Nothing is synthesised: fields the sources do not provide are written as null
 * and listed in `missingFields`. Run with `npm run data:fetch`; then
 * `npm run data:validate` to check the result against the schema.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const JOLPICA = "https://api.jolpi.ca/ergast/f1";
const OPENF1 = "https://api.openf1.org/v1";
const OUT_DIR = path.join(process.cwd(), "data", "races");

/** The races bundled with the app. Keep this list small and documented. */
const RACES = [
  { season: 2024, round: 1, openf1Circuit: "Sakhir", slug: "bahrain", notes: [] },
  {
    season: 2024,
    round: 4,
    openf1Circuit: "Suzuka",
    slug: "japan",
    notes: [
      "The race was red-flagged on lap 1. Cars changed tyres during the stoppage, so the timing feed records lap-1 'pit stops' lasting ~26 minutes and long early lap times. ApexStint flags these as red-flag stoppages and excludes them from pace baselines.",
    ],
  },
  { season: 2024, round: 16, openf1Circuit: "Monza", slug: "italy", notes: [] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { "User-Agent": "ApexStint dataset builder" } });
  if (res.status === 429 && attempt < 5) {
    await sleep(2000 * attempt);
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  // Stay well under Jolpica's burst limit (4 req/s).
  await sleep(400);
  return res.json();
}

/** Fetch every page of a paginated Jolpica endpoint and return the Races[0] objects. */
async function jolpicaAll(endpoint) {
  const pages = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const data = await getJson(`${JOLPICA}/${endpoint}.json?limit=100&offset=${offset}`);
    total = Number(data.MRData.total);
    const race = data.MRData.RaceTable.Races[0];
    if (race) pages.push(race);
    offset += 100;
  }
  return pages;
}

/** "1:37.284" | "23.312" | "37:21.123" -> milliseconds, or null when unparseable. */
export function parseClock(text) {
  if (typeof text !== "string" || text.trim() === "") return null;
  const parts = text.trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return Math.round(seconds * 1000);
}

async function buildRace({ season, round, openf1Circuit, slug, notes }) {
  const id = `${season}-${String(round).padStart(2, "0")}-${slug}`;
  console.log(`\n▶ ${id}`);

  const [resultsRace] = await jolpicaAll(`${season}/${round}/results`);
  if (!resultsRace) throw new Error(`No results for ${id}`);

  const drivers = resultsRace.Results.map((r) => ({
    driverId: r.Driver.driverId,
    code: r.Driver.code ?? r.Driver.familyName.slice(0, 3).toUpperCase(),
    number: Number(r.number),
    givenName: r.Driver.givenName,
    familyName: r.Driver.familyName,
    team: r.Constructor.name,
    teamId: r.Constructor.constructorId,
  }));

  const results = resultsRace.Results.map((r) => ({
    driverId: r.Driver.driverId,
    position: Number(r.position),
    positionText: r.positionText,
    grid: r.grid != null ? Number(r.grid) : null,
    laps: Number(r.laps),
    status: r.status,
    points: Number(r.points),
    timeMs: r.Time?.millis != null ? Number(r.Time.millis) : null,
    fastestLapRank: r.FastestLap?.rank != null ? Number(r.FastestLap.rank) : null,
  }));
  console.log(`  results: ${results.length}`);

  const lapPages = await jolpicaAll(`${season}/${round}/laps`);
  const laps = [];
  for (const page of lapPages) {
    for (const lap of page.Laps ?? []) {
      for (const t of lap.Timings) {
        laps.push({
          driverId: t.driverId,
          lap: Number(lap.number),
          position: t.position != null ? Number(t.position) : null,
          timeMs: parseClock(t.time),
        });
      }
    }
  }
  console.log(`  lap timings: ${laps.length}`);

  const pitPages = await jolpicaAll(`${season}/${round}/pitstops`);
  const pitStops = pitPages
    .flatMap((p) => p.PitStops ?? [])
    .map((p) => ({
      driverId: p.driverId,
      stop: Number(p.stop),
      lap: Number(p.lap),
      // Jolpica "duration" = time from pit-lane entry to exit as published by timing.
      durationMs: parseClock(p.duration),
    }));
  console.log(`  pit stops: ${pitStops.length}`);

  const sessions = await getJson(
    `${OPENF1}/sessions?year=${season}&session_name=Race&circuit_short_name=${encodeURIComponent(openf1Circuit)}`,
  );
  const session = sessions[0];
  let stints = [];
  if (session) {
    const raw = await getJson(`${OPENF1}/stints?session_key=${session.session_key}`);
    const byNumber = new Map(drivers.map((d) => [d.number, d.driverId]));
    const known = new Set(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]);
    stints = raw
      .filter((s) => byNumber.has(s.driver_number))
      .map((s) => ({
        driverId: byNumber.get(s.driver_number),
        stint: s.stint_number,
        lapStart: s.lap_start ?? null,
        lapEnd: s.lap_end ?? null,
        compound: known.has(s.compound) ? s.compound : null,
        tyreAgeAtStart: s.tyre_age_at_start ?? null,
      }))
      .sort((a, b) => a.driverId.localeCompare(b.driverId) || a.stint - b.stint);
  }
  console.log(`  stints: ${stints.length} (OpenF1 session ${session?.session_key ?? "n/a"})`);

  const missingFields = [
    "Sector times, speed traps and any car telemetry (not included in this dataset)",
    "Pit-lane time loss per circuit (the simulator asks the user for it)",
    "Weather, track temperature and Safety Car / VSC periods",
  ];
  const nullLapTimes = laps.filter((l) => l.timeMs == null).length;
  if (nullLapTimes) missingFields.push(`${nullLapTimes} lap timings without a parsable time`);
  const nullCompounds = stints.filter((s) => s.compound == null).length;
  if (nullCompounds) missingFields.push(`${nullCompounds} stints with unknown tyre compound`);
  const nullDurations = pitStops.filter((p) => p.durationMs == null).length;
  if (nullDurations) missingFields.push(`${nullDurations} pit stops without a duration`);
  const driversWithoutStints = drivers.filter((d) => !stints.some((s) => s.driverId === d.driverId));
  if (driversWithoutStints.length)
    missingFields.push(`No stint data for: ${driversWithoutStints.map((d) => d.code).join(", ")}`);

  const retrievedAt = new Date().toISOString();
  const race = {
    schemaVersion: 1,
    id,
    kind: "historical",
    season,
    round,
    raceName: resultsRace.raceName,
    date: resultsRace.date,
    circuit: {
      name: resultsRace.Circuit.circuitName,
      locality: resultsRace.Circuit.Location.locality,
      country: resultsRace.Circuit.Location.country,
    },
    scheduledLaps: Math.max(...results.map((r) => r.laps)),
    sources: [
      {
        name: "Jolpica-F1 API",
        url: "https://github.com/jolpica/jolpica-f1",
        license: "CC BY-NC-SA 4.0",
        fields: ["drivers", "results", "laps", "pitStops"],
        retrievedAt,
      },
      {
        name: "OpenF1 API",
        url: "https://openf1.org",
        license: "CC BY-NC-SA 4.0",
        fields: ["stints"],
        retrievedAt,
      },
    ],
    missingFields,
    notes,
    drivers,
    results,
    laps,
    pitStops,
    stints,
  };

  await writeFile(path.join(OUT_DIR, `${id}.json`), JSON.stringify(race) + "\n");
  return { id, season, round, raceName: race.raceName };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const index = [];
  for (const r of RACES) index.push(await buildRace(r));
  await writeFile(path.join(OUT_DIR, "..", "index.json"), JSON.stringify(index, null, 2) + "\n");
  console.log(`\n✔ wrote ${index.length} races to ${OUT_DIR}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
