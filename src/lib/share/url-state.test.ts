import { describe, expect, it } from "vitest";
import { defaultAssumptions } from "@/lib/sim/model";
import { decodeLabState, encodeLabState, type LabState } from "./url-state";

const state: LabState = {
  driverId: "max_verstappen",
  assumptions: defaultAssumptions(95.5, 23),
  strategies: [
    { id: "a", name: "VER as raced", stints: [{ compound: "SOFT", laps: 17, tyreAgeAtStart: 3, freeStop: false }, { compound: "HARD", laps: 40, tyreAgeAtStart: 0, freeStop: true }] },
    { id: "b", name: "Ünïcode ✓", stints: [{ compound: "MEDIUM", laps: 57, tyreAgeAtStart: 0, freeStop: false }] },
  ],
};

describe("url state", () => {
  it("round-trips", () => {
    const encoded = encodeLabState(state);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeLabState(encoded)).toEqual(state);
  });

  it("returns null for missing, malformed or out-of-range input", () => {
    expect(decodeLabState(null)).toBeNull();
    expect(decodeLabState("not-base64!!")).toBeNull();
    expect(decodeLabState(btoa(JSON.stringify({ v: 2 })))).toBeNull();
    const bad = { ...state, assumptions: { ...state.assumptions, pitLossSec: 9999 } };
    expect(decodeLabState(encodeLabState(bad))).toBeNull();
  });
});
