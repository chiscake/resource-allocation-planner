import { engineFail, engineOk, type SolverEngine } from '../../contract.ts';
import { buildSolveResult } from '../../shared/resultBuild.ts';
import { solveIpmRaw } from './native.ts';

export { solveIpmModel } from './native.ts';

export const ipmNativeEngine: SolverEngine = {
  method: 'ipm',
  engine: 'native',
  solve(model) {
    const raw = solveIpmRaw(model);
    if (!raw.ok) return engineFail(raw.reason);
    return engineOk({
      result: buildSolveResult(model, raw.x, raw.y, raw.feasible),
    });
  },
};
