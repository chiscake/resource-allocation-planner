import {
	libraryFor,
	LIMITS,
	SCHEMA_VERSION,
	type Model,
	type SolveEngine,
	type SolveMethod
} from './types.ts';
import { engineFail, type EngineOutcome } from './contract.ts';
import { defaultEngine, resolveEngine } from './registry.ts';

export type SolveResponse = {
	status: 'done' | 'rejected_too_large';
	result?: unknown;
	trace?: unknown;
	solver_meta: {
		venue: 'cloud' | 'local';
		library: string;
		method: SolveMethod;
		engine: SolveEngine;
		duration_ms: number;
		rejected_reason?: string;
		hint?: string;
		gap_vs_lp?: number;
	};
};

function rejected(
	method: SolveMethod,
	engine: SolveEngine,
	started: number,
	reason: string,
	hint?: string
): SolveResponse {
	return {
		status: 'rejected_too_large',
		solver_meta: {
			venue: 'cloud',
			library: libraryFor(method, 'cloud', engine),
			method,
			engine,
			duration_ms: performance.now() - started,
			rejected_reason: reason,
			hint
		}
	};
}

function wrap(
	method: SolveMethod,
	engine: SolveEngine,
	started: number,
	outcome: EngineOutcome
): SolveResponse {
	if (!outcome.ok) {
		return rejected(method, engine, started, outcome.fail.reason, outcome.fail.hint);
	}
	const { result, trace, gap_vs_lp, hint } = outcome.value;
	return {
		status: 'done',
		result,
		trace,
		solver_meta: {
			venue: 'cloud',
			library: libraryFor(method, 'cloud', engine),
			method,
			engine,
			duration_ms: performance.now() - started,
			gap_vs_lp,
			hint
		}
	};
}

export function runSolve(
	model: Model,
	method: SolveMethod = 'lp',
	engine?: SolveEngine
): SolveResponse {
	const started = performance.now();
	const resolved = resolveEngine(method, engine);
	const eng = resolved.engine;

	if (model.schema_version !== SCHEMA_VERSION) {
		return rejected(method, eng, started, 'schema');
	}
	const n = model.products.length;
	const m = model.resources.length;
	if (n > LIMITS.maxVariables || m > LIMITS.maxConstraints || m * n > LIMITS.maxDenseCells) {
		return rejected(method, eng, started, 'size', 'solve_locally');
	}

	try {
		const outcome = resolved.solve(model);
		if (performance.now() - started > LIMITS.singleSolveMs) {
			return rejected(method, eng, started, 'timeout');
		}
		return wrap(method, eng, started, outcome);
	} catch (e) {
		return wrap(method, eng, started, engineFail(e instanceof Error ? e.message : 'error'));
	}
}

export { defaultEngine };
