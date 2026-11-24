import { describe, expect, it } from 'vitest';
import { applyMutation, buildDefaultMutations, createTask13Model } from '$lib/domain';
import { maybeRoundPlan } from '$lib/display';
import { solveLocal } from '$lib/solver';
import { buildWhatIfRowData } from './whatif-row';

describe('sensitivity rows stay continuous', () => {
  it('buildWhatIfRowData keeps fractional plan / Z (no plan rounding)', () => {
    const model = createTask13Model();
    const base = solveLocal(model, 'local', 0, 'lp', 'native');
    expect(base.status).toBe('done');

    // Force a fractional scenario via price bump so Z and x may be non-integer.
    const mutation = {
      kind: 'price_change' as const,
      target: 'Частотомер',
      delta: 0.15,
    };
    const mutatedModel = applyMutation(model, mutation);
    const solved = solveLocal(mutatedModel, 'local', 0, 'lp', 'native');
    expect(solved.status).toBe('done');

    const row = buildWhatIfRowData({
      base: model,
      baseResult: base.result,
      mutation,
      mutatedModel,
      result: solved.result,
    });

    // Builder must mirror continuous solve — never nearest-integer post-process.
    expect(row.Z).toBe(solved.result!.Z);
    expect(row.plan).toEqual(solved.result!.x);
    expect(row.deltaZ).toBeCloseTo(solved.result!.Z - base.result!.Z, 6);

    // Policy: sensitivity rows must equal continuous solve, not maybeRoundPlan(…).
    void maybeRoundPlan(mutatedModel, solved.result!, true);
    for (const p of model.products) {
      expect(row.plan[p]).toBe(solved.result!.x[p]);
    }
  });

  it('pack builder path does not depend on roundPlan (continuous duals)', () => {
    const model = createTask13Model();
    const base = solveLocal(model, 'local', 0, 'lp', 'native');
    const mut = buildDefaultMutations(model).find(
      (m) => m.kind === 'resource_change' && m.target === 'Труд' && m.delta > 0,
    )!;
    const mutatedModel = applyMutation(model, mut);
    const solved = solveLocal(mutatedModel, 'local', 0, 'lp', 'native');
    const row = buildWhatIfRowData({
      base: model,
      baseResult: base.result,
      mutation: mut,
      mutatedModel,
      result: solved.result,
    });

    expect(row.shadowKind).toBe('resource');
    expect(row.shadowMetric).toBeCloseTo(solved.result!.shadow_prices['Труд']!, 6);
    // Labor +10% stays in [65;230] → continuous ΔZ = y₁·8 = 32/3
    expect(row.deltaZ).toBeCloseTo((4 / 3) * 8, 5);
  });
});
