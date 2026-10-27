import { describe, expect, it } from "vitest";
import { canonicalJson, fnv1a64 } from "@/lib/canonical";
import { datasetVersion, raceRepository } from "@/lib/data/repository";
import { experimentId, runExperiment, type ExperimentSpec } from "./experiment";
import { MODEL_VERSION, defaultAssumptions, simulate } from "./model";
import { initialStrategies, recordedDefaults } from "./recorded";

describe("canonicalJson", () => {
  it("is independent of key order, at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: [1, { x: 1, y: 2 }] }, b: 1 }));
  });
  it("keeps non-finite numbers distinct from null and from each other", () => {
    const forms = [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map((v) => canonicalJson({ v }));
    expect(new Set(forms).size).toBe(4);
  });
  it("omits undefined object values but keeps array positions", () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([undefined, 1])).toBe("[null,1]");
  });
});

describe("fnv1a64", () => {
  // Published FNV-1a 64-bit test vectors.
  it.each([
    ["", "cbf29ce484222325"],
    ["a", "af63dc4c8601ec8c"],
    ["foobar", "85944171f73967e8"],
  ])("fnv1a64(%j) = %s", (input, expected) => {
    expect(fnv1a64(input)).toBe(expected);
  });
  // Non-ASCII vectors computed independently (Python, over the UTF-8 bytes). A UTF-16
  // code-unit implementation gives different values (e.g. af64644c8602d3a4 for "é"), so these
  // pin the UTF-8 behaviour itself rather than merely that two strings differ.
  it.each([
    ["é", "0ac21707b7181e01"], // é, composed (UTF-8: C3 A9)
    ["é", "c0c9d418ee802e1f"], // e + combining acute (UTF-8: 65 CC 81)
  ])("hashes UTF-8 bytes: fnv1a64(%j) = %s", (input, expected) => {
    expect(fnv1a64(input)).toBe(expected);
  });
});

async function bahrainSpec(): Promise<Omit<ExperimentSpec, "modelVersion">> {
  const res = await raceRepository.getRace("2024-01-bahrain");
  if (!res.ok) throw new Error("invalid dataset");
  const d = recordedDefaults(res.race, "max_verstappen");
  return {
    raceId: res.race.id,
    datasetVersion: res.datasetVersion,
    totalLaps: res.race.scheduledLaps,
    assumptions: defaultAssumptions(d.baseLapSec, d.pitLossSec),
    strategies: initialStrategies(res.race, "max_verstappen"),
  };
}

describe("experiments", () => {
  it("are deterministic and add nothing beyond simulate()", async () => {
    const spec = await bahrainSpec();
    const a = runExperiment(spec);
    const b = runExperiment(structuredClone(spec));
    expect(b).toEqual(a);
    expect(a.spec.modelVersion).toBe(MODEL_VERSION);
    expect(a.results).toEqual(spec.strategies.map((s) => simulate(s, spec.assumptions, spec.totalLaps)));
  });

  it("have an id that ignores key order but changes with every input", async () => {
    const base: ExperimentSpec = { ...(await bahrainSpec()), modelVersion: MODEL_VERSION };
    const id = experimentId(base);
    expect(id).toMatch(/^exp_[0-9a-f]{16}$/);
    const reordered = Object.fromEntries(Object.entries(structuredClone(base)).reverse()) as unknown as ExperimentSpec;
    expect(experimentId(reordered)).toBe(id);

    const variants: [string, (s: ExperimentSpec) => void][] = [
      ["race", (s) => (s.raceId = "other")],
      ["dataset version", (s) => (s.datasetVersion = "sha256:0000000000000000")],
      ["model version", (s) => (s.modelVersion = "9.9.9")],
      ["race distance", (s) => (s.totalLaps += 1)],
      ["pit loss", (s) => (s.assumptions.pitLossSec += 0.5)],
      ["tyre wear", (s) => (s.assumptions.compounds.HARD.degSecPerLap += 0.001)],
      ["stint length", (s) => (s.strategies[1].stints[0].laps += 1)],
      ["free stop", (s) => (s.strategies[0].stints[1].freeStop = !s.strategies[0].stints[1].freeStop)],
    ];
    const ids = new Set([id]);
    for (const [name, mutate] of variants) {
      const s = structuredClone(base);
      mutate(s);
      expect(experimentId(s), name).not.toBe(id);
      ids.add(experimentId(s));
    }
    expect(ids.size).toBe(variants.length + 1);
  });

  /**
   * Golden reference. Totals were cross-checked independently (Python recomputation and the
   * pre-refactor UI). If this fails, model output changed for a valid input: either it is a
   * bug, or the change is intended and MODEL_VERSION must be bumped and these values updated.
   */
  it("reproduces the pinned Bahrain reference experiment", async () => {
    const record = runExperiment(await bahrainSpec());
    expect(record.spec.datasetVersion).toBe("sha256:ace5d0feeeeff79e");
    expect(record.results.map((r) => [r.strategyId, r.totalSec, r.chargedStops])).toEqual([
      ["a", 5526.803, 2],
      ["b", 5518.943, 1],
      ["c", 5524.948, 2],
    ]);
    expect(record.report.fastestId).toBe("b");
    expect(record.id).toBe("exp_76f8324d4828a643");
  });
});

describe("dataset versions", () => {
  it("match the independently computed (Python) SHA-256 of each canonical race file", async () => {
    const expected: Record<string, string> = {
      "2024-01-bahrain": "sha256:ace5d0feeeeff79e",
      "2024-04-japan": "sha256:4b4ab9bf2cfdbfd3",
      "2024-16-italy": "sha256:c185655444943a4d",
    };
    for (const [id, version] of Object.entries(expected)) {
      const res = await raceRepository.getRace(id);
      expect(res.ok && res.datasetVersion, id).toBe(version);
    }
  });

  it("change when the data changes, not when keys are reordered", () => {
    const raw = { a: 1, b: [1, 2], c: { d: "x" } };
    expect(datasetVersion({ c: { d: "x" }, b: [1, 2], a: 1 })).toBe(datasetVersion(raw));
    expect(datasetVersion({ ...raw, b: [1, 3] })).not.toBe(datasetVersion(raw));
  });
});
