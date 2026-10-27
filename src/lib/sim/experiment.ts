import { canonicalJson, fnv1a64 } from "@/lib/canonical";
import { compareStrategies, type ComparisonReport } from "./compare";
import { MODEL_VERSION, simulate, type Assumptions, type SimResult, type Strategy } from "./model";

/**
 * A reproducible experiment: everything that can change a simulated result, plus the
 * identity of the data and model that produced it. Two specs with the same id always
 * produce identical results (the simulator is deterministic and has no randomness).
 */
export interface ExperimentSpec {
  raceId: string;
  /** Content hash of the race file the inputs were derived from (see repository.datasetVersion). */
  datasetVersion: string;
  modelVersion: string;
  totalLaps: number;
  assumptions: Assumptions;
  strategies: Strategy[];
}

export interface ExperimentRecord {
  id: string;
  spec: ExperimentSpec;
  results: SimResult[];
  report: ComparisonReport;
}

/** Deterministic id: a hash of the canonical spec. Key order and object identity don't matter. */
export function experimentId(spec: ExperimentSpec): string {
  return `exp_${fnv1a64(canonicalJson(spec))}`;
}

/** Run every strategy under the same assumptions and compare them, recording full provenance. */
export function runExperiment(input: Omit<ExperimentSpec, "modelVersion">): ExperimentRecord {
  const spec: ExperimentSpec = { ...input, modelVersion: MODEL_VERSION };
  const results = spec.strategies.map((s) => simulate(s, spec.assumptions, spec.totalLaps));
  return { id: experimentId(spec), spec, results, report: compareStrategies(spec.strategies, results) };
}
