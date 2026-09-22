/**
 * Dual LP via javascript-lp-solver — used by GA for shadow prices
 * (GA is a primal heuristic; duals come from the continuous dual LP).
 */
import solver from "javascript-lp-solver";
import type { Model } from "$lib/domain";

export function solveLocalLpDuals(model: Model): number[] {
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
  const dual = solver.Solve({
    optimize: "cost",
    opType: "min",
    constraints,
    variables,
  }) as Record<string, unknown>;

  return model.resources.map((_, i) => Math.max(0, Number(dual[`y_${i}`] ?? 0)));
}
