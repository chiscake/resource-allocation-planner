import {
  applyMutation,
  libraryFor,
  type Model,
  type Mutation,
  type RunMutationsResponse,
  type SolveMethod,
} from "$lib/domain";
import { SOLVE_LIMITS } from "./limits";
import { solveLocal } from "./solve";
import type { ResolvedVenue } from "$lib/domain/types";

export function runMutationsLocal(
  base: Model,
  mutations: Mutation[],
  venue: ResolvedVenue = "local",
  method: SolveMethod = "lp",
): RunMutationsResponse {
  const started = performance.now();
  const lib = libraryFor(method, venue);
  if (mutations.length > SOLVE_LIMITS.mutationMaxK) {
    return {
      status: "rejected_too_large",
      items: [],
      solver_meta: {
        venue,
        library: lib,
        method,
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
          duration_ms: performance.now() - started,
          rejected_reason: "package_timeout",
        },
      };
    }
    const model = applyMutation(base, mutation);
    const response = solveLocal(model, venue, 0, method);
    items.push({ mutation, model, response });
    if (response.status === "rejected_too_large") {
      return {
        status: "rejected_too_large",
        items,
        solver_meta: {
          venue,
          library: lib,
          method,
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
      duration_ms: performance.now() - started,
    },
  };
}
