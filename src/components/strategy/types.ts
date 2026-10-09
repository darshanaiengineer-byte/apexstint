import type { RecordedDefaults, RecordedStrategyResult } from "@/lib/sim/recorded";

/** Everything the client needs about one driver; prepared on the server from recorded data. */
export interface LabDriver {
  driverId: string;
  code: string;
  name: string;
  team: string;
  positionText: string;
  /** Official race time, only for classified finishers on the lead lap. */
  recordedRaceMs: number | null;
  defaults: RecordedDefaults;
  recorded: RecordedStrategyResult;
  /** Representative (clean) recorded laps, in seconds. */
  cleanLaps: { lap: number; sec: number }[];
}

export const STRATEGY_IDS = ["a", "b", "c"] as const;
export const strategySlot = (id: string) => Math.max(0, STRATEGY_IDS.indexOf(id as (typeof STRATEGY_IDS)[number]));
