import type { SolveEngine, SolveMethod } from './types.ts';
import type { SolverEngine } from './contract.ts';
import { lpLibraryEngine, lpNativeEngine } from './methods/lp/index.ts';
import { ipmNativeEngine } from './methods/ipm/index.ts';
import { gaNativeEngine } from './methods/ga/index.ts';

const REGISTRY: Record<SolveMethod, Partial<Record<SolveEngine, SolverEngine>>> = {
	lp: {
		library: lpLibraryEngine,
		native: lpNativeEngine
	},
	ipm: {
		native: ipmNativeEngine
	},
	ga: {
		native: gaNativeEngine
	}
};

/** LP calc default = native; cloud one-shot passes library explicitly. */
export function defaultEngine(method: SolveMethod): SolveEngine {
	if (method === 'lp') return 'native';
	const slot = REGISTRY[method];
	if (slot.library) return 'library';
	return 'native';
}

export function resolveEngine(method: SolveMethod, engine?: SolveEngine): SolverEngine {
	const want = engine ?? defaultEngine(method);
	const impl = REGISTRY[method][want];
	if (impl) return impl;
	const fallback = REGISTRY[method][defaultEngine(method)];
	if (fallback) return fallback;
	throw new Error(`no engine registered for ${method}/${want}`);
}
