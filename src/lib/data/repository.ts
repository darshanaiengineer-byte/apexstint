import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/canonical";
import { raceSchema, type Race } from "./schema";
import { REGISTERED_RACE_FILES, REGISTERED_RACE_IDS } from "./race-registry.generated";

/**
 * Data access boundary. UI code depends only on this interface, so the bundled
 * JSON can later be swapped for a permitted remote source (an API with suitable
 * licensing, a database, ...) without touching components or the simulator.
 */
export interface RaceRepository {
  listRaces(): Promise<RaceSummary[]>;
  getRace(id: string): Promise<RaceLoadResult>;
}

export interface RaceSummary {
  id: string;
  kind: Race["kind"];
  season: number;
  round: number;
  raceName: string;
  date: string;
  circuitName: string;
  country: string;
  scheduledLaps: number;
  winner: string | null;
  driverCount: number;
}

export type RaceLoadResult =
  | { ok: true; race: Race; datasetVersion: string }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "invalid"; issues: string[] };

/**
 * Raw (unvalidated) payloads keyed by race id, from the generated registry. To add a race, add
 * data/races/<id>.json and run `npm run registry:generate` — no code edit is needed.
 */
const LOCAL_RACES: Readonly<Record<string, unknown>> = REGISTERED_RACE_FILES;

/**
 * Content identity of a race file: SHA-256 of its canonical JSON, truncated to 64 bits.
 * Regenerating or editing the data changes it; reformatting the file does not.
 * Server-side only (node:crypto).
 */
export function datasetVersion(raw: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(raw)).digest("hex").slice(0, 16)}`;
}

export function parseRace(raw: unknown): RaceLoadResult {
  const parsed = raceSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      issues: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  return { ok: true, race: parsed.data, datasetVersion: datasetVersion(raw) };
}

export function summarize(race: Race): RaceSummary {
  const winnerResult = race.results.find((r) => r.position === 1);
  const winner = winnerResult ? race.drivers.find((d) => d.driverId === winnerResult.driverId) : undefined;
  return {
    id: race.id,
    kind: race.kind,
    season: race.season,
    round: race.round,
    raceName: race.raceName,
    date: race.date,
    circuitName: race.circuit.name,
    country: race.circuit.country,
    scheduledLaps: race.scheduledLaps,
    winner: winner ? `${winner.givenName} ${winner.familyName}` : null,
    driverCount: race.drivers.length,
  };
}

export function createLocalRepository(payloads: Record<string, unknown> = LOCAL_RACES): RaceRepository {
  const cache = new Map<string, RaceLoadResult>();
  const load = (id: string): RaceLoadResult => {
    if (!Object.hasOwn(payloads, id)) return { ok: false, reason: "not-found" };
    let result = cache.get(id);
    if (!result) {
      result = parseRace(payloads[id]);
      // The registered key is the route; a payload declaring a different id must never be served under it.
      if (result.ok && result.race.id !== id) {
        result = { ok: false, reason: "invalid", issues: [`registered as "${id}" but the dataset declares id "${result.race.id}"`] };
      }
      cache.set(id, result);
    }
    return result;
  };

  return {
    async listRaces() {
      return Object.keys(payloads)
        .map((id) => load(id))
        .filter((r): r is Extract<RaceLoadResult, { ok: true }> => r.ok)
        .map((r) => summarize(r.race))
        .sort((a, b) => b.season - a.season || a.round - b.round);
    },
    async getRace(id) {
      return load(id);
    },
  };
}

/** The repository the app uses. Swap the implementation here for a remote source. */
export const raceRepository: RaceRepository = createLocalRepository();

export const LOCAL_RACE_IDS: readonly string[] = REGISTERED_RACE_IDS;
