import type { SolveTrace } from '../../types.ts';
import { engineFail, type SolverEngine } from '../../contract.ts';

export const lpNativeEngine: SolverEngine = {
	method: 'lp',
	engine: 'native',
	solve() {
		return engineFail('not_implemented', 'use_library');
	},
	solveStreaming(_model, onFrame) {
		const empty: SolveTrace = { method: 'lp', frames: [] };
		onFrame(empty);
		return engineFail('not_implemented', 'use_library');
	}
};
