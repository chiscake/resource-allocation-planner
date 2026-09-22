import solver from "javascript-lp-solver";
import {
  assertSchemaVersion,
  libraryFor,
  type Model,
  type SolveMethod,
  type SolveResponse,
  type SolveResult,
} from "$lib/domain";
import { checkModelSize, SOLVE_LIMITS } from "./limits";
import type { ResolvedVenue } from "$lib/domain/types";
import { buildSolveResult } from "./resultBuild";
import { solveIpmModel } from "./ipm";
import { solveGaModel } from "./ga";

const DUAL_EPS = 1e-6;

function buildPrimalModel(model: Model) {
  const constraints: Record<string, { max: number }> = {};
  for (let i = 0; i < model.resources.length; i++) {
    constraints[`r_${i}`] = { max: model.b[i] };
  }
  const variables: Record<string, Record<string, number>> = {};
  for (let j = 0; j < model.products.length; j++) {
    const v: Record<string, number> = { profit: model.c[j] };
    for (let i = 0; i < model.resources.length; i++) {
      v[`r_${i}`] = model.A[i][j];
    }
    variables[`x_${j}`] = v;
  }
  return {
    optimize: "profit",
    opType: "max" as const,
    constraints,
    variables,
  };
}

/** Dual: min b'y s.t. A'y >= c, y >= 0 */
function buildDualModel(model: Model) {
  const constraints: Record<string, { min: number }> = {};
  for (let j = 0; j < model.products.length; j++) {
    constraints[`p_${j}`] = { min: model.c[j] };
  }
  const variables: Record<string, Record<string, number>> = {};
  for (let i = 0; i < model.resources.length; i++) {
    const v: Record<string, number> = { cost: model.b[i] };
    for (let j = 0; j < model.products.length; j++) {
      v[`p_${j}`] = model.A[i][j];
    }
    variables[`y_${i}`] = v;
  }
  return {
    optimize: "cost",
    opType: "min" as const,
    constraints,
    variables,
  };
}

function extractLpResult(
  model: Model,
  primal: Record<string, unknown>,
  dual: Record<string, unknown>,
): SolveResult {
  const xVec = model.products.map((_, j) => Number(primal[`x_${j}`] ?? 0));
  const yVec = model.resources.map((_, i) =>
    Math.max(0, Number(dual[`y_${i}`] ?? 0)),
  );
  return buildSolveResult(model, xVec, yVec, Boolean(primal.feasible));
}

function solveLp(model: Model): SolveResult {
  const primalRaw = solver.Solve(buildPrimalModel(model)) as Record<
    string,
    unknown
  >;
  const dualRaw = solver.Solve(buildDualModel(model)) as Record<
    string,
    unknown
  >;
  return extractLpResult(model, primalRaw, dualRaw);
}

function rejected(
  venue: ResolvedVenue,
  method: SolveMethod,
  started: number,
  reason: string,
  hint?: string,
): SolveResponse {
  return {
    status: "rejected_too_large",
    solver_meta: {
      venue,
      library: libraryFor(method, venue),
      method,
      duration_ms: performance.now() - started,
      rejected_reason: reason,
      hint,
    },
  };
}

export function solveLocal(
  model: Model,
  venue: ResolvedVenue = "local",
  bodyBytes = 0,
  method: SolveMethod = "lp",
): SolveResponse {
  const started = performance.now();
  assertSchemaVersion(model);

  const size = checkModelSize(
    model.products.length,
    model.resources.length,
    bodyBytes,
  );
  if (!size.ok) {
    return rejected(
      venue,
      method,
      started,
      size.reasons.join(","),
      venue === "cloud" ? "solve_locally" : undefined,
    );
  }

  const deadline = started + SOLVE_LIMITS.singleSolveMs;

  try {
    if (method === "lp") {
      const result = solveLp(model);
      if (performance.now() > deadline) {
        return rejected(venue, method, started, "timeout");
      }
      return {
        status: "done",
        result,
        solver_meta: {
          venue,
          library: libraryFor("lp", venue),
          method: "lp",
          duration_ms: performance.now() - started,
        },
      };
    }

    if (method === "ipm") {
      const result = solveIpmModel(model);
      if (!result) {
        return rejected(venue, method, started, "ipm_failed");
      }
      if (performance.now() > deadline) {
        return rejected(venue, method, started, "timeout");
      }
      return {
        status: "done",
        result,
        solver_meta: {
          venue,
          library: libraryFor("ipm", venue),
          method: "ipm",
          duration_ms: performance.now() - started,
        },
      };
    }

    // ga
    const ga = solveGaModel(model);
    if (performance.now() > deadline) {
      return rejected(venue, method, started, "timeout");
    }
    const { ga_meta, ...result } = ga;
    let gap_vs_lp: number | undefined;
    try {
      const lp = solveLp(model);
      if (lp.Z > DUAL_EPS) {
        gap_vs_lp = Math.max(0, (lp.Z - result.Z) / lp.Z);
      }
    } catch {
      /* ignore LP reference failure */
    }
    return {
      status: "done",
      result,
      solver_meta: {
        venue,
        library: libraryFor("ga", venue),
        method: "ga",
        duration_ms: performance.now() - started,
        gap_vs_lp,
        hint: ga_meta.feasible ? undefined : "infeasible_best",
      },
    };
  } catch (e) {
    return rejected(
      venue,
      method,
      started,
      e instanceof Error ? e.message : "error",
    );
  }
}
