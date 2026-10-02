import type { Model, SolveRunOptions } from '../../types.ts';
import { engineFail, engineOk, type SolverEngine } from '../../contract.ts';
import { solveLpLibrary } from '../lp/library.ts';
import { DEFAULT_GA_HYPERPARAMS, solveGaModel } from './native.ts';
import { resolveGaFromRunConfig } from './presets.ts';

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
	solve(model, options?: SolveRunOptions) {
		try {
			const { hyper, preset } = resolveGaFromRunConfig(
				options?.ga,
				DEFAULT_GA_HYPERPARAMS
			);
			const ga = solveGaModel(model, hyper, {
				preset,
				// Cloud: keep aggregates, skip heavy population storage.
				collectTrace: false
			});
			const { ga_meta, trace, ...result } = ga;
			return engineOk({
				result,
				trace,
				gap_vs_lp: gapVsLp(model, result.Z),
				hint: ga_meta.feasible ? undefined : 'infeasible_best',
				provenance: {
					method: 'ga',
					engine: 'native',
					config: ga_meta.config,
					stopReason: ga_meta.stopReason,
					generationsRun: ga_meta.generations,
					populationSampled: ga_meta.populationSampled
				}
			});
		} catch (e) {
			return engineFail(e instanceof Error ? e.message : 'error');
		}
	}
};
