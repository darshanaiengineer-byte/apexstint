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

/** Build a raw link from a JSON value, bypassing the encoder (to test the decoder on its own). */
const rawLink = (wire: unknown) => Buffer.from(JSON.stringify(wire), "utf8").toString("base64url");
const wireOf = (s: LabState) => JSON.parse(Buffer.from(encodeLabState(s)!, "base64url").toString("utf8"));

/**
 * A real link produced by the published version (commit 54e9f77, before provenance existed):
 * Bahrain defaults, "VER as raced" and "1-stop M–H". It must keep decoding unchanged.
 */
const LEGACY_LINK =
  "eyJ2IjoxLCJkIjoibWF4X3ZlcnN0YXBwZW4iLCJhIjp7ImIiOjk1LjUyOSwicCI6MjUsImMiOnsiU09GVCI6Wy0wLjYsMC4xLDE4LDAuMjVdLCJNRURJVU0iOlswLDAuMDYsMzAsMC4yXSwiSEFSRCI6WzAuNCwwLjAzNSw0NSwwLjE1XSwiSU5URVJNRURJQVRFIjpbNSwwLjE1LDI1LDAuM10sIldFVCI6WzksMC4xLDMwLDAuM119fSwicyI6W3sibiI6IlZFUiBhcyByYWNlZCIsInQiOltbIlMiLDE3LDMsMF0sWyJIIiwyMCwwLDBdLFsiUyIsMjAsMCwwXV19LHsibiI6IjEtc3RvcCBN4oCTSCIsInQiOltbIk0iLDI5LDAsMF0sWyJIIiwyOCwwLDBdXX1dfQ";

describe("url state", () => {
  it("round-trips", () => {
    const encoded = encodeLabState(state);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeLabState(encoded)).toEqual(state);
  });

  it("round-trips provenance", () => {
    const withProvenance = { ...state, raceId: "2024-01-bahrain", datasetVersion: "sha256:ace5d0feeeeff79e" };
    expect(decodeLabState(encodeLabState(withProvenance))).toEqual(withProvenance);
  });

  it("decodes a link created by the published (pre-provenance) version unchanged", () => {
    const legacy = decodeLabState(LEGACY_LINK);
    expect(legacy).toEqual({
      driverId: "max_verstappen",
      assumptions: defaultAssumptions(95.529, 25),
      strategies: [
        {
          id: "a",
          name: "VER as raced",
          stints: [
            { compound: "SOFT", laps: 17, tyreAgeAtStart: 3, freeStop: false },
            { compound: "HARD", laps: 20, tyreAgeAtStart: 0, freeStop: false },
            { compound: "SOFT", laps: 20, tyreAgeAtStart: 0, freeStop: false },
          ],
        },
        {
          id: "b",
          name: "1-stop M–H",
          stints: [
            { compound: "MEDIUM", laps: 29, tyreAgeAtStart: 0, freeStop: false },
            { compound: "HARD", laps: 28, tyreAgeAtStart: 0, freeStop: false },
          ],
        },
      ],
    });
    expect(legacy).not.toHaveProperty("raceId");
    expect(legacy).not.toHaveProperty("datasetVersion");
  });

  it("decoder rejects missing, malformed and out-of-range links", () => {
    expect(decodeLabState(null)).toBeNull();
    expect(decodeLabState("not-base64!!")).toBeNull();
    expect(decodeLabState(btoa(JSON.stringify({ v: 2 })))).toBeNull();
    const outOfRange = wireOf(state);
    outOfRange.a.p = 9999;
    expect(decodeLabState(rawLink(outOfRange))).toBeNull();
    const nullPitLoss = wireOf(state);
    nullPitLoss.a.p = null; // what JSON makes of a non-finite number
    expect(decodeLabState(rawLink(nullPitLoss))).toBeNull();
  });
});

describe("encoder refuses states that would not round-trip (regressions)", () => {
  const nonFinite = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

  it.each(nonFinite)("non-finite cliff onset (%s) is refused, not encoded as 'no cliff'", (v) => {
    const s = structuredClone(state);
    s.assumptions.compounds.HARD.cliffAfterLaps = v;
    expect(encodeLabState(s)).toBeNull();
  });

  it.each(nonFinite)("non-finite values anywhere are refused (%s)", (v) => {
    const cases: ((s: LabState) => void)[] = [
      (s) => (s.assumptions.baseLapSec = v),
      (s) => (s.assumptions.pitLossSec = v),
      (s) => (s.assumptions.compounds.SOFT.paceOffsetSec = v),
      (s) => (s.assumptions.compounds.MEDIUM.degSecPerLap = v),
      (s) => (s.assumptions.compounds.WET.cliffSecPerLap = v),
      (s) => (s.strategies[0].stints[0].laps = v),
      (s) => (s.strategies[1].stints[0].tyreAgeAtStart = v),
    ];
    for (const mutate of cases) {
      const s = structuredClone(state);
      mutate(s);
      expect(encodeLabState(s)).toBeNull();
    }
  });

  it("out-of-range values are refused", () => {
    const s = structuredClone(state);
    s.assumptions.pitLossSec = 9999;
    expect(encodeLabState(s)).toBeNull();
  });

  it.each(["no", null, undefined, 1])("non-boolean free stop (%s) is refused, not coerced", (v) => {
    const s = structuredClone(state);
    (s.strategies[0].stints[1] as { freeStop: unknown }).freeStop = v;
    expect(encodeLabState(s)).toBeNull();
  });
});
