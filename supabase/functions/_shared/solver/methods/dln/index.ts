import type { Model, SolveRunOptions } from '../../types.ts';
import { engineFail, engineOk, type SolverEngine } from '../../contract.ts';
import { solveLpLibrary } from '../lp/library.ts';
import { DEFAULT_DLN_HYPERPARAMS, solveDlnModel } from './native.ts';
import { resolveDlnFromRunConfig } from './presets.ts';

export { solveDlnModel, solveDlnRaw } from './native.ts';

const DUAL_EPS = 1e-6;

function gapVsLp(model: Model, Z: number): number | undefined {
  try {
    const lp = solveLpLibrary(model);
    if (lp.Z > DUAL_EPS) return Math.max(0, (lp.Z - Z) / lp.Z);
  } catch {
    /* ignore */
  }
  return undefined;
}

export const dlnNativeEngine: SolverEngine = {
  method: 'dln',
  engine: 'native',
  solve(model, options?: SolveRunOptions) {
    try {
      const { hyper, preset } = resolveDlnFromRunConfig(options?.dln, DEFAULT_DLN_HYPERPARAMS);
      const out = solveDlnModel(model, hyper, preset);
      if (!out.ok) {
        return engineFail(out.reason, 'dln_unsupported');
      }
      const { result, dln_meta } = out;
      return engineOk({
        result,
        gap_vs_lp: gapVsLp(model, result.Z),
        hint: dln_meta.feasible ? undefined : 'infeasible_best',
        provenance: {
          method: 'dln',
          engine: 'native',
          config: dln_meta.config,
          stopReason: dln_meta.stopReason,
          iterations: dln_meta.iterations,
          residual: dln_meta.residual,
        },
      });
    } catch (e) {
      return engineFail(e instanceof Error ? e.message : 'error');
    }
  },
};
