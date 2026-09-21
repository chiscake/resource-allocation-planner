import {
  applyMutation,
  type Model,
  type Mutation,
  type RunMutationsResponse,
} from "$lib/domain";
import { SOLVE_LIMITS } from "./limits";
import { solveLocal } from "./solve";
import type { ResolvedVenue } from "$lib/domain/types";

export function runMutationsLocal(
  base: Model,
  mutations: Mutation[],
  venue: ResolvedVenue = "local",
): RunMutationsResponse {
  const started = performance.now();
  if (mutations.length > SOLVE_LIMITS.mutationMaxK) {
    return {
      status: "rejected_too_large",
      items: [],
      solver_meta: {
        venue,
        library: "javascript-lp-solver",
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
          library: "javascript-lp-solver",
          duration_ms: performance.now() - started,
          rejected_reason: "package_timeout",
        },
      };
    }
    const model = applyMutation(base, mutation);
    const response = solveLocal(model, venue);
    items.push({ mutation, model, response });
    if (response.status === "rejected_too_large") {
      return {
        status: "rejected_too_large",
        items,
        solver_meta: {
          venue,
          library: "javascript-lp-solver",
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
      library: "javascript-lp-solver",
      duration_ms: performance.now() - started,
    },
  };
}
