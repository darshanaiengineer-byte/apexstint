import { driverPitStops, driverTimeline, isStoppagePit, medianPitLaneMs, paceSummary } from "@/lib/data/derive";
import type { Race } from "@/lib/data/schema";
import { evenStints, type Strategy, type StrategyStint } from "./model";

/**
 * Bridges recorded data → simulator inputs. Recorded values are used only as
 * *starting points* that the user can see and override; the UI labels them so.
 */

export type RecordedStrategyResult =
  | { ok: true; stints: StrategyStint[]; notes: string[] }
  | { ok: false; reason: string };

/** Rebuild a driver's actual tyre sequence as a simulator strategy, if the data allows it. */
export function recordedStrategy(race: Race, driverId: string): RecordedStrategyResult {
  const result = race.results.find((r) => r.driverId === driverId);
  if (!result) return { ok: false, reason: "No classified result for this driver." };
  if (result.laps !== race.scheduledLaps) {
    return { ok: false, reason: `Completed ${result.laps}/${race.scheduledLaps} laps, so the stints do not cover the race distance.` };
  }
  const timeline = driverTimeline(race, driverId);
  if (timeline.length === 0 || timeline[0].origin !== "stints") {
    return { ok: false, reason: "No recorded tyre stints for this driver." };
  }
  if (timeline.some((s) => s.compound == null)) return { ok: false, reason: "At least one stint has an unknown compound." };
  let expected = 1;
  for (const seg of timeline) {
    if (seg.lapStart !== expected) return { ok: false, reason: `Stint data has a gap or overlap at lap ${expected}.` };
    expected = seg.lapEnd + 1;
  }
  if (expected - 1 !== race.scheduledLaps) return { ok: false, reason: "Stints do not reach the finish." };

  const stops = driverPitStops(race, driverId);
  const notes: string[] = [];
  const stints = timeline.map((seg, i): StrategyStint => {
    // A stint fitted during a race suspension (red flag) cost no racing time, so that stop is free.
    const prevEnd = i > 0 ? timeline[i - 1].lapEnd : null;
    const stop = prevEnd != null ? stops.find((p) => Math.abs(p.lap - prevEnd) <= 1) : undefined;
    const freeStop = i > 0 && stop != null && isStoppagePit(stop);
    if (freeStop) notes.push(`Stop before stint ${i + 1} took ${((stop!.durationMs ?? 0) / 1000).toFixed(0)} s in the pit lane (red-flag stoppage) — marked as a free stop.`);
    return {
      compound: seg.compound!,
      laps: seg.lapEnd - seg.lapStart + 1,
      tyreAgeAtStart: seg.tyreAgeAtStart ?? 0,
      freeStop,
    };
  });
  return { ok: true, stints, notes };
}

export interface RecordedDefaults {
  baseLapSec: number;
  baseLapSource: string;
  /** false = no clean laps recorded; baseLapSec is a labelled placeholder, not data. */
  baseLapFromData: boolean;
  pitLossSec: number;
  pitLossSource: string;
  pitLossFromData: boolean;
}

const FALLBACK_BASE_LAP_SEC = 90;
const FALLBACK_PIT_LOSS_SEC = 22;

/** Starting values for the two global inputs, with a description of where they came from. */
export function recordedDefaults(race: Race, driverId: string): RecordedDefaults {
  const pace = paceSummary(race, driverId);
  const pit = medianPitLaneMs(race);
  const code = race.drivers.find((d) => d.driverId === driverId)?.code ?? driverId;
  return {
    baseLapSec: pace.medianCleanMs != null ? Math.round(pace.medianCleanMs) / 1000 : FALLBACK_BASE_LAP_SEC,
    baseLapSource:
      pace.medianCleanMs != null
        ? `Median of ${pace.cleanLapCount} clean recorded laps by ${code}`
        : `No clean laps for ${code}; placeholder ${FALLBACK_BASE_LAP_SEC} s`,
    baseLapFromData: pace.medianCleanMs != null,
    pitLossSec: pit != null ? Math.round(pit / 500) / 2 : FALLBACK_PIT_LOSS_SEC,
    pitLossSource:
      pit != null
        ? "Median recorded pit-lane time in this race (entry→exit; an approximation of true pit loss)"
        : `No pit-lane times recorded; placeholder ${FALLBACK_PIT_LOSS_SEC} s`,
    pitLossFromData: pit != null,
  };
}

/** Default strategies shown on first load: the reference driver's actual strategy + two hypotheticals. */
export function initialStrategies(race: Race, driverId: string): Strategy[] {
  const n = race.scheduledLaps;
  const rec = recordedStrategy(race, driverId);
  const code = race.drivers.find((d) => d.driverId === driverId)?.code ?? "Driver";
  const oneStop: Strategy = { id: "b", name: "1-stop M–H", stints: evenStints(n, ["MEDIUM", "HARD"]) };
  const twoStop: Strategy = { id: "c", name: "2-stop S–H–M", stints: evenStints(n, ["SOFT", "HARD", "MEDIUM"]) };
  if (rec.ok) return [{ id: "a", name: `${code} as raced`, stints: rec.stints }, oneStop, twoStop];
  return [{ ...oneStop, id: "a" }, { ...twoStop, id: "b" }];
}
