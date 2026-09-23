import type { Model } from "$lib/domain";
import { engineFail, engineOk, type SolverEngine } from "../../contract";
import { solveLpLibrary } from "../lp/library";
import { solveGaModel } from "./native";

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
  solve(model) {
    try {
      const ga = solveGaModel(model);
      const { ga_meta, ...result } = ga;
      return engineOk({
        result,
        gap_vs_lp: gapVsLp(model, result.Z),
        hint: ga_meta.feasible ? undefined : "infeasible_best",
      });
    } catch (e) {
      return engineFail(e instanceof Error ? e.message : "error");
    }
  },
};
