import type {
  Model,
  SolveEngine,
  SolveMethod,
  SolveResult,
  SolveTrace,
} from "$lib/domain";

/** Callback for progressive native viz frames (GA generations, simplex steps, …). */
export type TraceSink = (trace: SolveTrace) => void;

export type EngineOk = {
  result: SolveResult;
  trace?: SolveTrace;
  gap_vs_lp?: number;
  hint?: string;
};

export type EngineFail = {
  reason: string;
  hint?: string;
};

export type EngineOutcome =
  | { ok: true; value: EngineOk }
  | { ok: false; fail: EngineFail };

/**
 * One method×engine implementation.
 * Calc path uses `solve`; viz path may use `solveStreaming` when present.
 */
export interface SolverEngine {
  readonly method: SolveMethod;
  readonly engine: SolveEngine;
  solve(model: Model): EngineOutcome;
  /**
   * Optional streaming seam for native viz. Default runners call `solve` then
   * push `value.trace` once if present.
   */
  solveStreaming?(model: Model, onFrame: TraceSink): EngineOutcome;
}

export function engineOk(value: EngineOk): EngineOutcome {
  return { ok: true, value };
}

export function engineFail(reason: string, hint?: string): EngineOutcome {
  return { ok: false, fail: { reason, hint } };
}
