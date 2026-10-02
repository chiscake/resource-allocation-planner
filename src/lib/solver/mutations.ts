import {
  applyMutation,
  libraryFor,
  type Model,
  type Mutation,
  type RunMutationsResponse,
  type SolveEngine,
  type SolveMethod,
  type SolveRunOptions,
} from "$lib/domain";
import type { ResolvedVenue } from "$lib/domain/types";
import { SOLVE_LIMITS } from "./limits";
import { defaultEngine } from "./registry";
import { solveLocal } from "./run";

export function runMutationsLocal(
  base: Model,
  mutations: Mutation[],
  venue: ResolvedVenue = "local",
  method: SolveMethod = "lp",
  engine?: SolveEngine,
  options?: SolveRunOptions,
): RunMutationsResponse {
  const started = performance.now();
  const eng = engine ?? defaultEngine(method);
  const lib = libraryFor(method, venue, eng);
  if (mutations.length > SOLVE_LIMITS.mutationMaxK) {
    return {
      status: "rejected_too_large",
      items: [],
      solver_meta: {
        venue,
        library: lib,
        method,
        engine: eng,
        duration_ms: 0,
        rejected_reason: `K>${SOLVE_LIMITS.mutationMaxK}`,
      },
    };
  }

  const items = [];
  for (const mutation of mutations) {
    if (performance.now() - started > SOLVE_LIMITS.mutationBudgetMs) {
      return {
        status: "rejected_too_large",
        items,
        solver_meta: {
          venue,
          library: lib,
          method,
          engine: eng,
          duration_ms: performance.now() - started,
          rejected_reason: "package_timeout",
        },
      };
    }
    const model = applyMutation(base, mutation);
    const response = solveLocal(model, venue, 0, method, eng, options);
    items.push({ mutation, model, response });
    if (response.status === "rejected_too_large") {
      return {
        status: "rejected_too_large",
        items,
        solver_meta: {
          venue,
          library: lib,
          method,
          engine: eng,
          duration_ms: performance.now() - started,
          rejected_reason: response.solver_meta.rejected_reason,
        },
      };
    }
  }

  return {
    status: "done",
    items,
    solver_meta: {
      venue,
      library: lib,
      method,
      engine: eng,
      duration_ms: performance.now() - started,
    },
  };
}
