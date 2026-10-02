import type {
	Model,
	SolveEngine,
	SolveMethod,
	SolveResult,
	SolveRunOptions,
	SolveRunProvenance,
	SolveTrace
} from './types.ts';

export type TraceSink = (trace: SolveTrace) => void;

export type EngineOk = {
	result: SolveResult;
	trace?: SolveTrace;
	gap_vs_lp?: number;
	hint?: string;
	provenance?: SolveRunProvenance;
};

export type EngineFail = {
	reason: string;
	hint?: string;
};

export type EngineOutcome =
	| { ok: true; value: EngineOk }
	| { ok: false; fail: EngineFail };

export interface SolverEngine {
	readonly method: SolveMethod;
	readonly engine: SolveEngine;
	solve(model: Model, options?: SolveRunOptions): EngineOutcome;
	solveStreaming?(
		model: Model,
		onFrame: TraceSink,
		options?: SolveRunOptions
	): EngineOutcome;
}

export function engineOk(value: EngineOk): EngineOutcome {
	return { ok: true, value };
}

export function engineFail(reason: string, hint?: string): EngineOutcome {
	return { ok: false, fail: { reason, hint } };
}
