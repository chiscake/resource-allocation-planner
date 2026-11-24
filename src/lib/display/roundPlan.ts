import type { Model, SolveResult, SolverMeta } from '$lib/domain/types';

/** Same order as continuous LP dual / slack checks. */
export const ROUND_FEASIBILITY_EPS = 1e-6;

/** Nearest-integer policy for plan \(x_i\) (Math.round; half away from 0 for positives). */
export type RoundingMethod = 'nearest';

/**
 * Post-process a continuous LP result: round each \(x_i\) to nearest integer,
 * recompute Z, resource_usage, resource_slack, and feasible from A x <= b.
 * Keeps shadow_prices / critical / non_critical from the continuous dual.
 *
 * UI scope: base result card / compare / export of that card only.
 * Do **not** apply to sensitivity (pack, interactive, ranges, Z(bᵢ) charts).
 */
export function roundPlanNearest(
  model: Model,
  result: SolveResult,
  method: RoundingMethod = 'nearest',
): SolveResult {
  void method;
  const x: Record<string, number> = {};
  for (const name of model.products) {
    const raw = result.x[name] ?? 0;
    // `+ 0` canonicalizes -0 from Math.round of small negatives.
    x[name] = Math.round(raw) + 0;
  }

  let Z = 0;
  for (let j = 0; j < model.products.length; j++) {
    Z += model.c[j] * (x[model.products[j]] ?? 0);
  }

  const resource_usage: Record<string, number> = {};
  const resource_slack: Record<string, number> = {};
  let feasible = true;

  for (let i = 0; i < model.resources.length; i++) {
    let usage = 0;
    for (let j = 0; j < model.products.length; j++) {
      usage += model.A[i][j] * (x[model.products[j]] ?? 0);
    }
    const name = model.resources[i];
    resource_usage[name] = usage;
    resource_slack[name] = model.b[i] - usage;
    if (usage > model.b[i] + ROUND_FEASIBILITY_EPS) feasible = false;
  }

  return {
    x,
    Z,
    resource_usage,
    resource_slack,
    shadow_prices: { ...result.shadow_prices },
    critical_resources: [...result.critical_resources],
    non_critical_resources: [...result.non_critical_resources],
    feasible,
  };
}

/** Apply nearest-integer rounding when enabled; otherwise return the continuous result. */
export function maybeRoundPlan(model: Model, result: SolveResult, enabled: boolean): SolveResult {
  if (!enabled) return result;
  return roundPlanNearest(model, result);
}

/** Annotate solver_meta when the displayed plan is post-rounded (duals still from LP). */
export function withRoundingMeta(meta: SolverMeta, enabled: boolean): SolverMeta {
  if (!enabled) return meta;
  return {
    ...meta,
    hint: 'rounded',
    rounding: 'nearest',
  };
}
