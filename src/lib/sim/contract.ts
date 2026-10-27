/**
 * The simulation input contract: the single source of truth for every numeric limit.
 *
 * The simulator (`simulate`), the share-link decoder (`url-state`) and the UI inputs all
 * read these limits, so they cannot drift apart. Values outside a range, NaN and ±Infinity
 * are rejected with a readable error instead of producing a non-finite race time.
 */

export interface Range {
  min: number;
  max: number;
  integer?: boolean;
  label: string;
  unit?: string;
}

export const LIMITS = {
  baseLapSec: { min: 30, max: 300, label: "Base lap", unit: "s" },
  pitLossSec: { min: 0, max: 120, label: "Pit loss per stop", unit: "s" },
  paceOffsetSec: { min: -30, max: 30, label: "pace offset", unit: "s" },
  degSecPerLap: { min: 0, max: 5, label: "wear per lap", unit: "s" },
  cliffAfterLaps: { min: 1, max: 100, integer: true, label: "cliff onset", unit: "laps" },
  cliffSecPerLap: { min: 0, max: 10, label: "extra wear past the cliff", unit: "s" },
  stintLaps: { min: 1, max: 200, integer: true, label: "stint length", unit: "laps" },
  tyreAgeAtStart: { min: 0, max: 60, integer: true, label: "starting tyre age", unit: "laps" },
} as const satisfies Record<string, Range>;

/** Structural limits. */
export const MAX_STINTS = 6;
export const MAX_STRATEGIES = 3;

/** True when `value` is a finite number satisfying `range`. Allocation-free: runs on every simulation. */
export function inRange(value: unknown, range: Range): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= range.min && value <= range.max && (!range.integer || Number.isInteger(value));
}

/** The error message for a value that failed `inRange`. Only call on the failure path. */
export function rangeError(value: unknown, range: Range, subject: string): string {
  const bounds = `between ${range.min} and ${range.max}${range.unit ? ` ${range.unit}` : ""}`;
  if (typeof value !== "number" || !Number.isFinite(value)) return `${subject} must be a finite number ${bounds} (got ${String(value)}).`;
  if (value < range.min || value > range.max) return `${subject} must be ${bounds} (got ${value}).`;
  return `${subject} must be a whole number (got ${value}).`;
}

/** Convenience wrapper: an error message, or null when valid. NaN and ±Infinity always fail. */
export function checkRange(value: unknown, range: Range, subject: string): string | null {
  return inRange(value, range) ? null : rangeError(value, range, subject);
}

/** Input attributes for a UI field bound to a limit. */
export const fieldLimits = (range: Range) => ({ min: range.min, max: range.max, integer: range.integer ?? false });
