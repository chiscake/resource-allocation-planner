import solver from "javascript-lp-solver";
import {
  assertSchemaVersion,
  type Model,
  type SolveResponse,
  type SolveResult,
} from "$lib/domain";
import { checkModelSize, SOLVE_LIMITS } from "./limits";
import type { ResolvedVenue } from "$lib/domain/types";

const DUAL_EPS = 1e-6;
const CRITICAL_EPS = 1e-4;

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

function extractResult(
  model: Model,
  primal: Record<string, unknown>,
  dual: Record<string, unknown>,
): SolveResult {
  const x: Record<string, number> = {};
  for (let j = 0; j < model.products.length; j++) {
    const val = Number(primal[`x_${j}`] ?? 0);
    x[model.products[j]] = val;
  }
  const Z = Number(primal.result ?? 0);
  const resource_usage: Record<string, number> = {};
  const resource_slack: Record<string, number> = {};
  const shadow_prices: Record<string, number> = {};
  const critical_resources: string[] = [];
  const non_critical_resources: string[] = [];

  for (let i = 0; i < model.resources.length; i++) {
    let usage = 0;
    for (let j = 0; j < model.products.length; j++) {
      usage += model.A[i][j] * (x[model.products[j]] ?? 0);
    }
    const name = model.resources[i];
    resource_usage[name] = usage;
    resource_slack[name] = model.b[i] - usage;
    const sp = Math.max(0, Number(dual[`y_${i}`] ?? 0));
    shadow_prices[name] = sp < DUAL_EPS ? 0 : sp;
    if (shadow_prices[name] > CRITICAL_EPS) critical_resources.push(name);
    else non_critical_resources.push(name);
  }

  return {
    x,
    Z,
    resource_usage,
    resource_slack,
    shadow_prices,
    critical_resources,
    non_critical_resources,
    feasible: Boolean(primal.feasible),
  };
}

export function solveLocal(
  model: Model,
  venue: ResolvedVenue = "local",
  bodyBytes = 0,
): SolveResponse {
  const started = performance.now();
  assertSchemaVersion(model);

  const size = checkModelSize(
    model.products.length,
    model.resources.length,
    bodyBytes,
  );
  if (!size.ok) {
    return {
      status: "rejected_too_large",
      solver_meta: {
        venue,
        library: "javascript-lp-solver",
        duration_ms: performance.now() - started,
        rejected_reason: size.reasons.join(","),
        hint: venue === "cloud" ? "solve_locally" : undefined,
      },
    };
  }

  const deadline = started + SOLVE_LIMITS.singleSolveMs;
  const primalRaw = solver.Solve(buildPrimalModel(model)) as Record<
    string,
    unknown
  >;
  if (performance.now() > deadline) {
    return {
      status: "rejected_too_large",
      solver_meta: {
        venue,
        library: "javascript-lp-solver",
        duration_ms: performance.now() - started,
        rejected_reason: "timeout",
      },
    };
  }
  const dualRaw = solver.Solve(buildDualModel(model)) as Record<
    string,
    unknown
  >;
  const result = extractResult(model, primalRaw, dualRaw);

  return {
    status: "done",
    result,
    solver_meta: {
      venue,
      library: "javascript-lp-solver",
      duration_ms: performance.now() - started,
    },
  };
}
