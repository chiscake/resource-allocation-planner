import { describe, expect, it } from 'vitest';
import {
  applyMutation,
  buildDefaultMutations,
  buildWhatIfRowData,
  createTask13Model,
} from '$lib/domain';
import { solveLocal, runMutationsLocal } from '$lib/solver';
import {
  inputToPct,
  preserveTraceForMeta,
  responseFromSaved,
  solveMethodToTab,
  tabToSolveMethod,
  whatIfRowsFromMutations,
} from './solve-session.svelte';

describe('solve-session helpers', () => {
  it('inputToPct maps percent text to fraction and blank to null', () => {
    expect(inputToPct('')).toBeNull();
    expect(inputToPct('  ')).toBeNull();
    expect(inputToPct('10')).toBeCloseTo(0.1);
    expect(inputToPct('0')).toBe(0);
    expect(inputToPct('nope')).toBeNull();
  });

  it('responseFromSaved rebuilds done stub without requiring a trace', () => {
    const model = createTask13Model();
    const solved = solveLocal(model, 'local', 0, 'ga', 'native', {
      ga: { preset: 'fast', seed: 3 },
    });
    expect(solved.status).toBe('done');
    const stub = responseFromSaved(solved.result, solved.solver_meta);
    expect(stub?.status).toBe('done');
    expect(stub?.trace).toBeUndefined();
    expect(stub?.solver_meta.provenance?.method).toBe('ga');
    expect(responseFromSaved(null, solved.solver_meta)).toBeNull();
  });

  it('preserveTraceForMeta keeps GA frames across post-solve reload', () => {
    const model = createTask13Model();
    const solved = solveLocal(model, 'local', 0, 'ga', 'native', {
      ga: { preset: 'fast', seed: 5, maxGenerations: 12 },
    });
    expect(solved.trace?.method).toBe('ga');
    if (solved.trace?.method !== 'ga') return;
    expect(solved.trace.generations.length).toBeGreaterThan(0);

    // Simulate task load(): DB has meta+result, not the in-memory trace.
    const kept = preserveTraceForMeta(solved.trace, solved.solver_meta);
    expect(kept).toBe(solved.trace);
    expect(kept?.method).toBe('ga');
    if (kept?.method === 'ga') {
      expect(kept.generations.length).toBe(solved.trace.generations.length);
    }

    // Method mismatch or missing meta → drop (avoid stale LP frames on GA tab).
    expect(preserveTraceForMeta(solved.trace, { ...solved.solver_meta, method: 'lp' })).toBeNull();
    expect(preserveTraceForMeta(solved.trace, null)).toBeNull();
    expect(preserveTraceForMeta(null, solved.solver_meta)).toBeNull();
  });

  it('tabToSolveMethod / solveMethodToTab round-trip', () => {
    expect(tabToSolveMethod('plan')).toBe('lp');
    expect(tabToSolveMethod('ipm')).toBe('ipm');
    expect(tabToSolveMethod('ga')).toBe('ga');
    expect(tabToSolveMethod('dln')).toBe('dln');
    expect(tabToSolveMethod('4d')).toBe('lp');
    expect(solveMethodToTab('lp')).toBe('plan');
    expect(solveMethodToTab('ipm')).toBe('ipm');
    expect(solveMethodToTab('ga')).toBe('ga');
    expect(solveMethodToTab('dln')).toBe('dln');
  });

  it('whatIfRowsFromMutations includes shadow metrics for Task 13 pack', () => {
    const model = createTask13Model();
    const base = solveLocal(model, 'local', 0, 'lp', 'native');
    expect(base.status).toBe('done');
    const pack = runMutationsLocal(model, buildDefaultMutations(model), 'local', 'lp', 'native');
    expect(pack.status).toBe('done');
    const rows = whatIfRowsFromMutations(pack, model, base.result);

    const laborPlus = rows.find(
      (r) =>
        r.mutation.kind === 'resource_change' &&
        r.mutation.target === 'Труд' &&
        r.mutation.delta > 0,
    );
    expect(laborPlus).toBeDefined();
    expect(laborPlus!.shadowKind).toBe('resource');
    expect(laborPlus!.shadowMetric).toBeGreaterThan(0);
    expect(laborPlus!.plan['Частотомер']).toBeDefined();
    expect(Number.isFinite(laborPlus!.deltaZ)).toBe(true);

    const mod = rows.find(
      (r) => r.mutation.kind === 'modernization' && r.mutation.target === 'Частотомер',
    );
    expect(mod).toBeDefined();
    expect(mod!.shadowKind).toBe('modernization');
    expect(mod!.shadowMetric).toBeCloseTo(mod!.deltaZ, 6);

    const price = rows.find(
      (r) => r.mutation.kind === 'price_change' && r.mutation.target === 'Генератор',
    );
    expect(price).toBeDefined();
    expect(price!.shadowKind).toBe('none');
    expect(price!.shadowMetric).toBeNull();
    expect(Number.isFinite(price!.deltaZ)).toBe(true);
  });
});

describe('buildWhatIfRowData', () => {
  it('resource shadow comes from re-solved dual', () => {
    const model = createTask13Model();
    const base = solveLocal(model, 'local', 0, 'lp', 'native');
    const mut = {
      kind: 'resource_change' as const,
      target: 'Труд',
      delta: 0.1,
    };
    const next = applyMutation(model, mut);
    const res = solveLocal(next, 'local', 0, 'lp', 'native');
    const row = buildWhatIfRowData({
      base: model,
      baseResult: base.result,
      mutation: mut,
      mutatedModel: next,
      result: res.result,
    });
    expect(row.shadowKind).toBe('resource');
    expect(row.shadowMetric).toBeCloseTo(res.result!.shadow_prices['Труд'], 6);
  });
});
