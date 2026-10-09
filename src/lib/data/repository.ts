import { raceSchema, type Race } from "./schema";
import bahrain2024 from "../../../data/races/2024-01-bahrain.json";
import japan2024 from "../../../data/races/2024-04-japan.json";
import italy2024 from "../../../data/races/2024-16-italy.json";

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
  | { ok: true; race: Race }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "invalid"; issues: string[] };

/** Raw (unvalidated) payloads keyed by race id. Add new files here. */
const LOCAL_RACES: Record<string, unknown> = {
  "2024-01-bahrain": bahrain2024,
  "2024-04-japan": japan2024,
  "2024-16-italy": italy2024,
};

export function parseRace(raw: unknown): RaceLoadResult {
  const parsed = raceSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      issues: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  return { ok: true, race: parsed.data };
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
      cache.set(id, result);
    }
    return result;
  };

  return {
    async listRaces() {
      return Object.keys(payloads)
        .map((id) => load(id))
        .filter((r): r is { ok: true; race: Race } => r.ok)
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

export const LOCAL_RACE_IDS = Object.keys(LOCAL_RACES);
