import { engineFail, engineOk, type SolverEngine } from '../../contract';
import { buildSolveResult } from '../../shared/resultBuild';
import { solveIpmRaw } from './native';

export { solveIpmModel, solveIpmRaw } from './native';
export type { IpmRaw } from './native';

export const ipmNativeEngine: SolverEngine = {
  method: 'ipm',
  engine: 'native',
  solve(model) {
    const raw = solveIpmRaw(model);
    if (!raw.ok) return engineFail(raw.reason);
    return engineOk({
      result: buildSolveResult(model, raw.x, raw.y, raw.feasible),
      provenance: { method: 'ipm', engine: 'native' },
    });
  },
};
