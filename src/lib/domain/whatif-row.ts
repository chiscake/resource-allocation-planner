import { formatMutationLabel } from './mutations';
import { mutationBeforeAfter, mutationBeforeAfterFromMutated } from './mutation-display';
import type { Model, Mutation, SolveResult } from './types';

const PLAN_SUPPORT_EPS = 1e-6;

/** True when the set of positive plan variables differs from the base. */
export function planCompositionChanged(
  baseX: Record<string, number> | null | undefined,
  nextX: Record<string, number> | null | undefined,
  eps = PLAN_SUPPORT_EPS,
): boolean {
  const support = (x: Record<string, number> | null | undefined) =>
    Object.entries(x ?? {})
      .filter(([, v]) => Number.isFinite(v) && Math.abs(v) > eps)
      .map(([k]) => k)
      .sort();
  const a = support(baseX);
  const b = support(nextX);
  if (a.length !== b.length) return true;
  return a.some((k, i) => k !== b[i]);
}

/** Sensitivity row payload for the what-if table (UI). */
export type WhatIfRowData = {
  title: string;
  Z: number;
  baseZ: number;
  deltaZ: number;
  mutation: Mutation;
  mutatedModel: Model;
  before: string;
  after: string;
  /** Plan x after re-solve (product → qty). */
  plan: Record<string, number>;
  /**
   * resource_change → shadow price of that resource (re-solved dual).
   * modernization → allowable modernization price (= ΔZ).
   * price_change → null (not required by assignment).
   */
  shadowMetric: number | null;
  shadowKind: 'resource' | 'modernization' | 'none';
  criticalResources: string[];
  /** Optimal plan composition (support of x) differs from the base solution. */
  basisChanged: boolean;
  /** Persisted sensitivity child id when row comes from cloud solve_nodes. */
  nodeId?: string;
};

function emptyPlan(model: Model): Record<string, number> {
  const plan: Record<string, number> = {};
  for (const p of model.products) plan[p] = 0;
  return plan;
}

/** Build one sensitivity row from base + mutated solve (covers Task 13 а/б/в). */
export function buildWhatIfRowData(input: {
  base: Model;
  baseResult: SolveResult | null | undefined;
  mutation: Mutation;
  mutatedModel: Model;
  result: SolveResult | null | undefined;
  /** Prefer mutated-side before/after when base is unknown/stale. */
  valuesFromMutated?: boolean;
}): WhatIfRowData {
  const { base, baseResult, mutation, mutatedModel, result } = input;
  const pair = input.valuesFromMutated
    ? mutationBeforeAfterFromMutated(mutatedModel, mutation)
    : mutationBeforeAfter(base, mutation);

  const Z = result?.Z ?? Number.NaN;
  const baseZ = baseResult?.Z ?? Number.NaN;
  const deltaZ = Number.isFinite(Z) && Number.isFinite(baseZ) ? Z - baseZ : Number.NaN;

  let shadowMetric: number | null = null;
  let shadowKind: WhatIfRowData['shadowKind'] = 'none';

  if (mutation.kind === 'resource_change' && result?.shadow_prices) {
    shadowMetric = result.shadow_prices[mutation.target] ?? 0;
    shadowKind = 'resource';
  } else if (mutation.kind === 'modernization' && Number.isFinite(deltaZ)) {
    // Допустимая «теневая» цена модернизации = прирост оптимальной прибыли.
    shadowMetric = deltaZ;
    shadowKind = 'modernization';
  }

  const plan = result?.x ? { ...result.x } : emptyPlan(mutatedModel);
  return {
    title: formatMutationLabel(mutation, base),
    Z,
    baseZ,
    deltaZ,
    mutation,
    mutatedModel,
    before: pair.before,
    after: pair.after,
    plan,
    shadowMetric,
    shadowKind,
    criticalResources: result?.critical_resources ? [...result.critical_resources] : [],
    basisChanged: planCompositionChanged(baseResult?.x, plan),
  };
}
