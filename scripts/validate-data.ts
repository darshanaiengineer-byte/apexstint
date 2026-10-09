/**
 * Validates every bundled race file against the schema and prints coverage and
 * cross-source consistency warnings. Exit code 1 on any schema error.
 *   npm run data:validate
 */
import { LOCAL_RACE_IDS, raceRepository } from "../src/lib/data/repository";
import { consistencyWarnings } from "../src/lib/data/schema";
import { coverage } from "../src/lib/data/derive";

async function main() {
  let failed = false;
  for (const id of LOCAL_RACE_IDS) {
    const res = await raceRepository.getRace(id);
    if (!res.ok) {
      failed = true;
      console.error(`✖ ${id}: ${res.reason}`);
      if (res.reason === "invalid") res.issues.forEach((i) => console.error(`    ${i}`));
      continue;
    }
    const c = coverage(res.race);
    console.log(
      `✔ ${id}  drivers=${c.drivers} laps=${c.lapRowsWithTime}/${c.lapRows} pitStops=${c.pitStops} (long ${c.longPitStops}, red-flag ${c.stoppagePitStops}) stints=${c.stintsWithCompound}/${c.stints} drivers-with-stints=${c.driversWithStints}`,
    );
    for (const w of consistencyWarnings(res.race)) console.warn(`    ⚠ ${w}`);
  }
  process.exit(failed ? 1 : 0);
}

main();
