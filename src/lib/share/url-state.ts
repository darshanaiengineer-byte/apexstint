import "@/lib/zod-setup";
import { z } from "zod";
import { COMPOUNDS, type Compound } from "@/lib/data/schema";
import { type Assumptions, type Strategy } from "@/lib/sim/model";
import { LIMITS, MAX_STINTS, MAX_STRATEGIES, type Range } from "@/lib/sim/contract";

/**
 * Shareable strategy-lab state, stored in a single `cfg` query parameter as
 * base64url-encoded compact JSON. Decoding is fully validated: a tampered or
 * stale link yields `null` and the page falls back to defaults with a notice.
 */

export interface LabState {
  /** Provenance (optional for backward compatibility with links created before it existed). */
  raceId?: string;
  datasetVersion?: string;
  driverId: string;
  assumptions: Assumptions;
  strategies: Strategy[];
}

type Code = "S" | "M" | "H" | "I" | "W";
const CODE: Record<Compound, Code> = { SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W" };
const FROM_CODE: Record<Code, Compound> = { S: "SOFT", M: "MEDIUM", H: "HARD", I: "INTERMEDIATE", W: "WET" };

/** Limits come from the shared simulation contract, so decoder and simulator always agree. */
const num = (r: Range) => (r.integer ? z.number().finite().int() : z.number().finite()).min(r.min).max(r.max);
const compoundTuple = z.tuple([num(LIMITS.paceOffsetSec), num(LIMITS.degSecPerLap), num(LIMITS.cliffAfterLaps).nullable(), num(LIMITS.cliffSecPerLap)]);

const wireSchema = z.object({
  v: z.literal(1),
  r: z.string().max(64).optional(),
  dv: z.string().max(80).optional(),
  d: z.string().max(64),
  a: z.object({
    b: num(LIMITS.baseLapSec),
    p: num(LIMITS.pitLossSec),
    c: z.object({
      SOFT: compoundTuple,
      MEDIUM: compoundTuple,
      HARD: compoundTuple,
      INTERMEDIATE: compoundTuple,
      WET: compoundTuple,
    }),
  }),
  s: z
    .array(
      z.object({
        n: z.string().max(40),
        t: z
          .array(z.tuple([z.enum(["S", "M", "H", "I", "W"]), num(LIMITS.stintLaps), num(LIMITS.tyreAgeAtStart), z.union([z.literal(0), z.literal(1)])]))
          .min(1)
          .max(MAX_STINTS),
      }),
    )
    .min(1)
    .max(MAX_STRATEGIES),
});
type Wire = z.infer<typeof wireSchema>;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64: string): string {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const MAX_PARAM_LENGTH = 4000;

/**
 * Encode lab state as a share-link parameter, or return null if the state is one the decoder
 * would reject. The wire object is checked against the decoder's own schema *before* JSON
 * serialisation, so non-finite numbers (which JSON would turn into null — e.g. a NaN cliff
 * onset silently becoming "no cliff"), out-of-range values and non-boolean free stops can never
 * produce a link that decodes to a different state. For every non-null result,
 * decodeLabState(encodeLabState(s)) reproduces s.
 */
export function encodeLabState(state: LabState): string | null {
  const c = {} as Wire["a"]["c"];
  for (const k of COMPOUNDS) {
    const m = state.assumptions.compounds[k];
    c[k] = [m.paceOffsetSec, m.degSecPerLap, m.cliffAfterLaps, m.cliffSecPerLap];
  }
  // Only real booleans map to 0/1. Anything else (including the number 1) becomes -1, which the
  // schema always rejects, so it is refused rather than coerced into a valid flag.
  const flag = (v: unknown) => (v === true ? 1 : v === false ? 0 : -1) as 0 | 1;
  const wire: Wire = {
    v: 1,
    ...(state.raceId ? { r: state.raceId } : {}),
    ...(state.datasetVersion ? { dv: state.datasetVersion } : {}),
    d: state.driverId,
    a: { b: state.assumptions.baseLapSec, p: state.assumptions.pitLossSec, c },
    s: state.strategies.map((s) => ({
      n: s.name,
      t: s.stints.map((t): [Code, number, number, 0 | 1] => [CODE[t.compound], t.laps, t.tyreAgeAtStart, flag(t.freeStop)]),
    })),
  };
  if (!wireSchema.safeParse(wire).success) return null;
  const encoded = toBase64Url(JSON.stringify(wire));
  return encoded.length > MAX_PARAM_LENGTH ? null : encoded;
}

export function decodeLabState(param: string | null | undefined): LabState | null {
  if (!param || param.length > MAX_PARAM_LENGTH) return null;
  let json: unknown;
  try {
    json = JSON.parse(fromBase64Url(param));
  } catch {
    return null;
  }
  const parsed = wireSchema.safeParse(json);
  if (!parsed.success) return null;
  const w = parsed.data;
  const ids = ["a", "b", "c"];
  const compounds = {} as Assumptions["compounds"];
  for (const k of COMPOUNDS) {
    const [paceOffsetSec, degSecPerLap, cliffAfterLaps, cliffSecPerLap] = w.a.c[k];
    compounds[k] = { paceOffsetSec, degSecPerLap, cliffAfterLaps, cliffSecPerLap };
  }
  return {
    ...(w.r ? { raceId: w.r } : {}),
    ...(w.dv ? { datasetVersion: w.dv } : {}),
    driverId: w.d,
    assumptions: { baseLapSec: w.a.b, pitLossSec: w.a.p, compounds },
    strategies: w.s.map((s, i) => ({
      id: ids[i],
      name: s.n,
      stints: s.t.map(([code, laps, age, free]) => ({ compound: FROM_CODE[code], laps, tyreAgeAtStart: age, freeStop: free === 1 })),
    })),
  };
}
