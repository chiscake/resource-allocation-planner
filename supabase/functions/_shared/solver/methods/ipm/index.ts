import { engineFail, engineOk, type SolverEngine } from '../../contract.ts';
import { solveIpmModel } from './native.ts';

export { solveIpmModel } from './native.ts';

export const ipmNativeEngine: SolverEngine = {
  method: 'ipm',
  engine: 'native',
  solve(model) {
    const result = solveIpmModel(model);
    if (!result) return engineFail('ipm_failed');
    return engineOk({ result });
  },
};
