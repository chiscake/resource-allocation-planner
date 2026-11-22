import { describe, expect, it } from 'vitest';
import { createTask13Model } from '$lib/domain';
import { solveLocal } from './run';
import { solveGaRaw, DEFAULT_GA_HYPERPARAMS, GA_PRESET_DEFS } from './methods/ga';
import { regenerateTrace } from './regenerate';
import { listCompareConfigs, runMethodComparison } from './compare';

describe('ga trace + provenance', () => {
  it('emits generation snapshots and actual stop count', () => {
    const model = createTask13Model();
    const { meta, trace } = solveGaRaw(model, {
      ...DEFAULT_GA_HYPERPARAMS,
      seed: 7,
      maxGenerations: 30,
      stagnationGenerations: 5,
      useStagnation: true,
    });
    expect(trace.method).toBe('ga');
    if (trace.method !== 'ga') return;
    expect(trace.generations.length).toBeGreaterThan(0);
    expect(meta.generations).toBe(meta.generations);
    expect(meta.generations).toBeLessThanOrEqual(30);
    expect(meta.stopReason === 'stagnation' || meta.stopReason === 'maxGenerations').toBe(true);
    if (meta.stopReason === 'stagnation') {
      expect(meta.generations).toBeLessThan(30);
    }
    expect(meta.config.seed).toBe(7);
    const snap = trace.generations[0];
    expect(snap.population.length).toBeGreaterThan(0);
    expect(snap.population[0].genes.length).toBe(model.products.length);
  });

  it('applies GA preset hyperparameters (fast vs precise)', () => {
    const model = createTask13Model();
    const fast = solveLocal(model, 'local', 0, 'ga', 'native', {
      ga: { preset: 'fast', seed: 1 },
    });
    const precise = solveLocal(model, 'local', 0, 'ga', 'native', {
      ga: { preset: 'precise', seed: 1 },
    });
    expect(fast.status).toBe('done');
    expect(precise.status).toBe('done');
    const fastProv = fast.solver_meta.provenance;
    const preciseProv = precise.solver_meta.provenance;
    expect(fastProv?.method).toBe('ga');
    expect(preciseProv?.method).toBe('ga');
    if (fastProv?.method !== 'ga' || preciseProv?.method !== 'ga') return;
    expect(fastProv.config.maxGenerations).toBe(GA_PRESET_DEFS.fast.maxGenerations);
    expect(fastProv.config.populationSize).toBe(GA_PRESET_DEFS.fast.populationSize);
    expect(preciseProv.config.maxGenerations).toBe(GA_PRESET_DEFS.precise.maxGenerations);
    expect(preciseProv.config.populationSize).toBe(GA_PRESET_DEFS.precise.populationSize);
  });

  it('solveLocal attaches ga provenance and trace', () => {
    const model = createTask13Model();
    const res = solveLocal(model, 'local', 0, 'ga', 'native', {
      ga: { preset: 'fast', seed: 11 },
    });
    expect(res.status).toBe('done');
    expect(res.trace?.method).toBe('ga');
    expect(res.solver_meta.provenance?.method).toBe('ga');
    if (res.solver_meta.provenance?.method === 'ga') {
      expect(res.solver_meta.provenance.config.seed).toBe(11);
    }
  });

  it('regenerateTrace reproduces GA genes for same seed', () => {
    const model = createTask13Model();
    const first = solveLocal(model, 'local', 0, 'ga', 'native', {
      ga: { preset: 'fast', seed: 99, maxGenerations: 20 },
    });
    expect(first.status).toBe('done');
    const { response } = regenerateTrace(model, first.solver_meta.provenance, 'ga', 'native');
    expect(response.result?.x).toEqual(first.result?.x);
  });
});

describe('method comparison', () => {
  it('lists configs and runs with lp native baseline', () => {
    const configs = listCompareConfigs();
    expect(configs.some((c) => c.id === 'lp:native')).toBe(true);
    const model = createTask13Model();
    const rows = runMethodComparison(model, ['lp:native', 'ga:native'], {
      gaPreset: 'fast',
      gaHyper: { seed: 3, maxGenerations: 15 },
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const baseline = rows.find((r) => r.config.id === 'lp:native');
    expect(baseline?.ok).toBe(true);
    expect(baseline?.deltaZ).toBe(0);
  });
});
