import {
  assertSchemaVersion,
  libraryFor,
  type Model,
  type SolveEngine,
  type SolveMethod,
  type SolveResponse,
  type SolveRunOptions,
} from '$lib/domain';
import type { ResolvedVenue } from '$lib/domain/types';
import { engineFail, type EngineOutcome, type TraceSink } from './contract';
import { checkModelSize, SOLVE_LIMITS } from './limits';
import { defaultEngine, resolveEngine } from './registry';

function rejected(
  venue: ResolvedVenue,
  method: SolveMethod,
  engine: SolveEngine,
  started: number,
  reason: string,
  hint?: string,
): SolveResponse {
  return {
    status: 'rejected_too_large',
    solver_meta: {
      venue,
      library: libraryFor(method, venue, engine),
      method,
      engine,
      duration_ms: performance.now() - started,
      rejected_reason: reason,
      hint,
    },
  };
}

function wrapOutcome(
  venue: ResolvedVenue,
  method: SolveMethod,
  engine: SolveEngine,
  started: number,
  outcome: EngineOutcome,
): SolveResponse {
  if (!outcome.ok) {
    return rejected(venue, method, engine, started, outcome.fail.reason, outcome.fail.hint);
  }
  const { result, trace, gap_vs_lp, hint, provenance } = outcome.value;
  return {
    status: 'done',
    result,
    trace,
    solver_meta: {
      venue,
      library: libraryFor(method, venue, engine),
      method,
      engine,
      duration_ms: performance.now() - started,
      gap_vs_lp,
      hint,
      provenance: provenance ?? ({ method, engine } as import('$lib/domain').SolveRunProvenance),
    },
  };
}

function runEngine(
  model: Model,
  venue: ResolvedVenue,
  bodyBytes: number,
  method: SolveMethod,
  engine: SolveEngine | undefined,
  started: number,
  stream?: TraceSink,
  options?: SolveRunOptions,
): SolveResponse {
  assertSchemaVersion(model);

  const resolved = resolveEngine(method, engine);
  const eng = resolved.engine;

  const size = checkModelSize(model.products.length, model.resources.length, bodyBytes);
  if (!size.ok) {
    return rejected(
      venue,
      method,
      eng,
      started,
      size.reasons.join(','),
      venue === 'cloud' ? 'solve_locally' : undefined,
    );
  }

  const deadline = started + SOLVE_LIMITS.singleSolveMs;

  try {
    let outcome: EngineOutcome;
    if (stream) {
      if (resolved.solveStreaming) {
        outcome = resolved.solveStreaming(model, stream, options);
      } else {
        outcome = resolved.solve(model, options);
        if (outcome.ok && outcome.value.trace) {
          stream(outcome.value.trace);
        }
      }
    } else {
      outcome = resolved.solve(model, options);
    }

    if (performance.now() > deadline) {
      return rejected(venue, method, eng, started, 'timeout');
    }
    return wrapOutcome(venue, method, eng, started, outcome);
  } catch (e) {
    return wrapOutcome(
      venue,
      method,
      eng,
      started,
      engineFail(e instanceof Error ? e.message : 'error'),
    );
  }
}

export function solveLocal(
  model: Model,
  venue: ResolvedVenue = 'local',
  bodyBytes = 0,
  method: SolveMethod = 'lp',
  engine?: SolveEngine,
  options?: SolveRunOptions,
): SolveResponse {
  return runEngine(model, venue, bodyBytes, method, engine, performance.now(), undefined, options);
}

/** Dual API for native viz (Q8b): same as solveLocal but optional frame sink. */
export function solveLocalStreaming(
  model: Model,
  opts: {
    venue?: ResolvedVenue;
    bodyBytes?: number;
    method?: SolveMethod;
    engine?: SolveEngine;
    onTrace?: TraceSink;
    options?: SolveRunOptions;
  } = {},
): SolveResponse {
  const method = opts.method ?? 'lp';
  const engine = opts.engine ?? defaultEngine(method);
  return runEngine(
    model,
    opts.venue ?? 'local',
    opts.bodyBytes ?? 0,
    method,
    engine,
    performance.now(),
    opts.onTrace,
    opts.options,
  );
}
