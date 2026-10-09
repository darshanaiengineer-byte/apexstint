import { z } from "zod";
import { COMPOUNDS, type Compound } from "@/lib/data/schema";
import { MAX_STINTS, type Assumptions, type Strategy } from "@/lib/sim/model";

/**
 * Shareable strategy-lab state, stored in a single `cfg` query parameter as
 * base64url-encoded compact JSON. Decoding is fully validated: a tampered or
 * stale link yields `null` and the page falls back to defaults with a notice.
 */

export interface LabState {
  driverId: string;
  assumptions: Assumptions;
  strategies: Strategy[];
}

type Code = "S" | "M" | "H" | "I" | "W";
const CODE: Record<Compound, Code> = { SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W" };
const FROM_CODE: Record<Code, Compound> = { S: "SOFT", M: "MEDIUM", H: "HARD", I: "INTERMEDIATE", W: "WET" };

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const compoundTuple = z.tuple([num(-30, 30), num(0, 5), num(1, 100).int().nullable(), num(0, 10)]);

const wireSchema = z.object({
  v: z.literal(1),
  d: z.string().max(64),
  a: z.object({
    b: num(30, 300),
    p: num(0, 120),
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
          .array(z.tuple([z.enum(["S", "M", "H", "I", "W"]), num(1, 200).int(), num(0, 60).int(), z.union([z.literal(0), z.literal(1)])]))
          .min(1)
          .max(MAX_STINTS),
      }),
    )
    .min(1)
    .max(3),
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

export function encodeLabState(state: LabState): string {
  const c = {} as Wire["a"]["c"];
  for (const k of COMPOUNDS) {
    const m = state.assumptions.compounds[k];
    c[k] = [m.paceOffsetSec, m.degSecPerLap, m.cliffAfterLaps, m.cliffSecPerLap];
  }
  const wire: Wire = {
    v: 1,
    d: state.driverId,
    a: { b: state.assumptions.baseLapSec, p: state.assumptions.pitLossSec, c },
    s: state.strategies.map((s) => ({
      n: s.name,
      t: s.stints.map((t): [Code, number, number, 0 | 1] => [CODE[t.compound], t.laps, t.tyreAgeAtStart, t.freeStop ? 1 : 0]),
    })),
  };
  return toBase64Url(JSON.stringify(wire));
}

export function decodeLabState(param: string | null | undefined): LabState | null {
  if (!param || param.length > 4000) return null;
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
    driverId: w.d,
    assumptions: { baseLapSec: w.a.b, pitLossSec: w.a.p, compounds },
    strategies: w.s.map((s, i) => ({
      id: ids[i],
      name: s.n,
      stints: s.t.map(([code, laps, age, free]) => ({ compound: FROM_CODE[code], laps, tyreAgeAtStart: age, freeStop: free === 1 })),
    })),
  };
}
