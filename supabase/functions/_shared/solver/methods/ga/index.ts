import type { Model } from '../../types.ts';
import { engineFail, engineOk, type SolverEngine } from '../../contract.ts';
import { solveLpLibrary } from '../lp/library.ts';
import { solveGaModel } from './native.ts';

export { solveGaModel } from './native.ts';

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

export const gaNativeEngine: SolverEngine = {
	method: 'ga',
	engine: 'native',
	solve(model) {
		try {
			const ga = solveGaModel(model);
			const { ga_meta, ...result } = ga;
			return engineOk({
				result,
				gap_vs_lp: gapVsLp(model, result.Z),
				hint: ga_meta.feasible ? undefined : 'infeasible_best'
			});
		} catch (e) {
			return engineFail(e instanceof Error ? e.message : 'error');
		}
	}
};
