/**
 * Categorical series slots (validated reference palette; light/dark steps live in CSS
 * as --series-N). Colour follows the entity: a slot is assigned on selection and kept
 * until that entity is removed, so filtering never repaints survivors. Each slot also
 * has its own dash pattern so lines stay distinguishable without colour.
 */
export const SERIES_SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"] as const;
export const SERIES_DASH = ["", "6 3", "2 3", "8 3 2 3"] as const;

export function nextFreeSlot(used: number[], max = SERIES_SLOTS.length): number | null {
  for (let i = 0; i < max; i++) if (!used.includes(i)) return i;
  return null;
}

export const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-jetbrains)" } as const;
export const GRID_STROKE = "var(--grid)";
