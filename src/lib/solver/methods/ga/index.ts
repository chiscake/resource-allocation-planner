import type { Model, SolveRunOptions } from "$lib/domain";
import { engineFail, engineOk, type SolverEngine } from "../../contract";
import { solveLpLibrary } from "../lp/library";
import { DEFAULT_GA_HYPERPARAMS, solveGaModel } from "./native";
import { resolveGaFromRunConfig } from "./presets";

export {
  solveGaModel,
  solveGaRaw,
  DEFAULT_GA_HYPERPARAMS,
} from "./native";
export type {
  GaHyperparameters,
  GaSolveMeta,
  SelectionMethod,
  CrossoverType,
} from "./native";
export {
  GA_PRESET_DEFS,
  GA_DEFAULT_SEED,
  GA_TRACE_MAX_INDIVIDUALS,
  hyperToRunConfig,
  runConfigToHyper,
  resolveGaHyper,
  resolveGaFromRunConfig,
} from "./presets";
export type { GaPresetId } from "./presets";

const DUAL_EPS = 1e-6;

function gapVsLp(model: Model, Z: number): number | undefined {
  try {
    const lp = solveLpLibrary(model);
    if (lp.Z > DUAL_EPS) return Math.max(0, (lp.Z - Z) / lp.Z);
  } catch {
    /* ignore LP reference failure */
  }
  return undefined;
}

export const gaNativeEngine: SolverEngine = {
  method: "ga",
  engine: "native",
  solve(model, options?: SolveRunOptions) {
    try {
      const { hyper, preset } = resolveGaFromRunConfig(
        options?.ga,
        DEFAULT_GA_HYPERPARAMS,
      );
      const ga = solveGaModel(model, hyper, {
        preset,
        collectTrace: true,
      });
      const { ga_meta, trace, ...result } = ga;
      return engineOk({
        result,
        trace,
        gap_vs_lp: gapVsLp(model, result.Z),
        hint: ga_meta.feasible ? undefined : "infeasible_best",
        provenance: {
          method: "ga",
          engine: "native",
          config: ga_meta.config,
          stopReason: ga_meta.stopReason,
          generationsRun: ga_meta.generations,
          populationSampled: ga_meta.populationSampled,
        },
      });
    } catch (e) {
      return engineFail(e instanceof Error ? e.message : "error");
    }
  },
};
