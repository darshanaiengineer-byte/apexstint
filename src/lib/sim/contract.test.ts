import { describe, expect, it } from "vitest";
import { decodeLabState, encodeLabState } from "@/lib/share/url-state";
import { LIMITS, checkRange, type Range } from "./contract";
import { defaultAssumptions, simulate, validateAssumptions, validateStrategy, type Assumptions, type Strategy } from "./model";

/**
 * Contract tests generated from LIMITS: the simulator and the share-link decoder must accept
 * exactly the same values, and every non-finite or out-of-range input must fail closed.
 */

type Field = keyof typeof LIMITS;

const baseStrategy = (): Strategy => ({
  id: "a",
  name: "contract",
  stints: [
    { compound: "MEDIUM", laps: 20, tyreAgeAtStart: 0, freeStop: false },
    { compound: "HARD", laps: 20, tyreAgeAtStart: 0, freeStop: false },
  ],
});

/** Build a (strategy, assumptions, totalLaps) case with one field set to `value`. */
function caseWith(field: Field, value: number) {
  const a: Assumptions = defaultAssumptions(90, 22);
  const s = baseStrategy();
  let totalLaps = 40;
  switch (field) {
    case "baseLapSec":
    case "pitLossSec":
      a[field] = value;
      break;
    case "paceOffsetSec":
    case "degSecPerLap":
    case "cliffAfterLaps":
    case "cliffSecPerLap":
      a.compounds.HARD = { ...a.compounds.HARD, [field]: value };
      break;
    case "stintLaps":
      s.stints[1].laps = value;
      totalLaps = 20 + value;
      break;
    case "tyreAgeAtStart":
      s.stints[1].tyreAgeAtStart = value;
      break;
  }
  return { a, s, totalLaps };
}

function samples(r: Range) {
  const eps = r.integer ? 1 : 1e-6;
  return {
    valid: [r.min, r.max, r.integer ? Math.round((r.min + r.max) / 2) : (r.min + r.max) / 2],
    invalid: [r.min - eps, r.max + eps, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, ...(r.integer ? [r.min + 0.5] : [])],
  };
}

const validState = () => ({ driverId: "x", assumptions: defaultAssumptions(90, 22), strategies: [baseStrategy()] });

/** Where each field lives in the share-link wire format (s[0].t[1] is the HARD stint). */
type Wire = { a: { b: number; p: number; c: Record<string, number[]> }; s: { t: unknown[][] }[] };
const WIRE_FIELD: Record<Field, (w: Wire, v: number) => void> = {
  baseLapSec: (w, v) => (w.a.b = v),
  pitLossSec: (w, v) => (w.a.p = v),
  paceOffsetSec: (w, v) => (w.a.c.HARD[0] = v),
  degSecPerLap: (w, v) => (w.a.c.HARD[1] = v),
  cliffAfterLaps: (w, v) => (w.a.c.HARD[2] = v),
  cliffSecPerLap: (w, v) => (w.a.c.HARD[3] = v),
  stintLaps: (w, v) => (w.s[0].t[1][1] = v),
  tyreAgeAtStart: (w, v) => (w.s[0].t[1][2] = v),
};

describe.each(Object.keys(LIMITS) as Field[])("LIMITS.%s", (field) => {
  const range = LIMITS[field];
  const { valid, invalid } = samples(range);

  it.each(valid)("simulate accepts %s", (v) => {
    const { a, s, totalLaps } = caseWith(field, v);
    const r = simulate(s, a, totalLaps);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(Number.isFinite(r.totalSec)).toBe(true);
  });

  it.each(invalid)("simulate rejects %s with a readable error", (v) => {
    const { a, s, totalLaps } = caseWith(field, v);
    const r = simulate(s, a, totalLaps);
    expect(r.ok).toBe(false);
    expect(r.totalSec).toBeNull();
    expect(r.errors.join(" ")).toContain(range.label);
  });

  /** The simulator's verdict on the single value under test. */
  const simAccepts = (v: number) => {
    const { a, s, totalLaps } = caseWith(field, v);
    return validateAssumptions(a).length === 0 && !validateStrategy(s, totalLaps).errors.some((e) => e.includes(range.label));
  };

  // Raw links bypass the encoder, so this tests the decoder on its own. JSON cannot carry
  // non-finite numbers, so only finite samples apply here; the encoder test covers the rest.
  it.each([...valid, ...invalid.filter(Number.isFinite)])("share-link decoder agrees with the simulator for %s", (v) => {
    const wire = JSON.parse(Buffer.from(encodeLabState(validState())!, "base64url").toString("utf8"));
    WIRE_FIELD[field](wire, v);
    const decoded = decodeLabState(Buffer.from(JSON.stringify(wire), "utf8").toString("base64url"));
    expect(decoded !== null).toBe(simAccepts(v));
  });

  it.each([...valid, ...invalid])("share-link encoder agrees with the simulator for %s (incl. non-finite)", (v) => {
    const { a, s } = caseWith(field, v);
    const encoded = encodeLabState({ driverId: "x", assumptions: a, strategies: [s] });
    expect(encoded !== null).toBe(simAccepts(v));
    if (encoded !== null) expect(decodeLabState(encoded)).toEqual({ driverId: "x", assumptions: a, strategies: [s] });
  });
});

describe("fail-closed regressions (each returned ok: true before the contract existed)", () => {
  const cases: [string, Partial<Assumptions["compounds"]["HARD"]> | null, Partial<Pick<Assumptions, "pitLossSec">> | null][] = [
    ["NaN wear → total was NaN", { degSecPerLap: Number.NaN }, null],
    ["Infinite pace offset → total was Infinity", { paceOffsetSec: Number.POSITIVE_INFINITY }, null],
    ["negative wear was accepted", { degSecPerLap: -5 }, null],
    ["cliff at age 0 was accepted", { cliffAfterLaps: 0 }, null],
    ["infinite pit loss → total was Infinity", null, { pitLossSec: Number.POSITIVE_INFINITY }],
  ];
  it.each(cases)("%s", (_name, compoundPatch, globalPatch) => {
    const a = defaultAssumptions(90, 22);
    if (compoundPatch) a.compounds.HARD = { ...a.compounds.HARD, ...compoundPatch };
    if (globalPatch) Object.assign(a, globalPatch);
    const r = simulate(baseStrategy(), a, 40);
    expect(r.ok).toBe(false);
    expect(r.totalSec).toBeNull();
  });
});

describe("structural validation", () => {
  it("rejects unknown compounds instead of crashing", () => {
    const s = baseStrategy();
    (s.stints[0] as { compound: string }).compound = "ULTRASOFT";
    const r = simulate(s, defaultAssumptions(90, 22), 40);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/unknown compound "ULTRASOFT"/);
  });

  it("rejects a missing tyre model", () => {
    const a = defaultAssumptions(90, 22);
    const withoutWet = { ...a, compounds: Object.fromEntries(Object.entries(a.compounds).filter(([c]) => c !== "WET")) } as Assumptions;
    expect(validateAssumptions(withoutWet)).toContain("Tyre model (wet) is missing.");
  });

  it("rejects invalid race distances", () => {
    for (const n of [0, -1, 40.5, Number.NaN]) expect(simulate(baseStrategy(), defaultAssumptions(90, 22), n).ok).toBe(false);
  });

  it.each([true, false])("accepts a boolean free stop (%s)", (v) => {
    const s = baseStrategy();
    s.stints[1].freeStop = v;
    const r = simulate(s, defaultAssumptions(90, 22), 40);
    expect(r.ok).toBe(true);
    expect(r.chargedStops).toBe(v ? 0 : 1);
  });

  it.each([["no"], [null], [undefined], [1], ["true"]])("rejects a non-boolean free stop (%j) instead of waiving the pit loss", (v) => {
    const s = baseStrategy();
    (s.stints[1] as { freeStop: unknown }).freeStop = v;
    const r = simulate(s, defaultAssumptions(90, 22), 40);
    expect(r.ok).toBe(false);
    expect(r.totalSec).toBeNull();
    expect(r.errors).toContain(`Stint 2: free stop must be true or false (got ${String(v)}).`);
  });

  it("rejects an omitted free stop", () => {
    const s = baseStrategy();
    delete (s.stints[0] as { freeStop?: boolean }).freeStop;
    expect(simulate(s, defaultAssumptions(90, 22), 40).errors).toContain("Stint 1: free stop must be true or false (got undefined).");
  });

  it("allows a null cliff (no cliff)", () => {
    const a = defaultAssumptions(90, 22);
    a.compounds.HARD = { ...a.compounds.HARD, cliffAfterLaps: null };
    expect(simulate(baseStrategy(), a, 40).ok).toBe(true);
  });

  it("checkRange reports the offending value", () => {
    expect(checkRange(Number.NaN, LIMITS.baseLapSec, "Base lap")).toMatch(/finite number between 30 and 300 s \(got NaN\)/);
    expect(checkRange(301, LIMITS.baseLapSec, "Base lap")).toMatch(/between 30 and 300 s \(got 301\)/);
    expect(checkRange("90", LIMITS.baseLapSec, "Base lap")).not.toBeNull();
  });
});
