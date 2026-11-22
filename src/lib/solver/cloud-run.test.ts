import { describe, expect, it } from 'vitest';
import { buildDefaultMutations, createTask13Model } from '$lib/domain';
import { parseSolveRunOptions } from '../../../supabase/functions/_shared/solver/parseOptions';
import { GA_PRESET_DEFS } from './methods/ga/presets';
import { DLN_PRESET_DEFS } from './methods/dln/presets';
import { runMutationsLocal } from './mutations';
import { solveLocal } from './run';

describe('Edge solve options (parse + engine)', () => {
  it('parseSolveRunOptions accepts ga preset, seed, and numeric fields', () => {
    const parsed = parseSolveRunOptions({
      ga: {
        preset: 'fast',
        seed: 99,
        populationSize: 12,
        useStagnation: false,
      },
    });
    expect(parsed?.ga?.preset).toBe('fast');
    expect(parsed?.ga?.seed).toBe(99);
    expect(parsed?.ga?.populationSize).toBe(12);
    expect(parsed?.ga?.useStagnation).toBe(false);
  });

  it('parsed Edge body options drive GA preset hyperparameters locally', () => {
    const model = createTask13Model();
    const options = parseSolveRunOptions({
      ga: { preset: 'precise', seed: 5 },
    });
    const res = solveLocal(model, 'local', 0, 'ga', 'native', options);
    expect(res.status).toBe('done');
    const prov = res.solver_meta.provenance;
    expect(prov?.method).toBe('ga');
    if (prov?.method !== 'ga') return;
    expect(prov.config.maxGenerations).toBe(GA_PRESET_DEFS.precise.maxGenerations);
    expect(prov.config.populationSize).toBe(GA_PRESET_DEFS.precise.populationSize);
    expect(prov.config.seed).toBe(5);
  });

  it('runMutationsLocal forwards GA options into each item response', () => {
    const model = createTask13Model();
    const options = parseSolveRunOptions({
      ga: { preset: 'fast', seed: 3 },
    });
    const pack = runMutationsLocal(
      model,
      buildDefaultMutations(model).slice(0, 1),
      'local',
      'ga',
      'native',
      options,
    );
    expect(pack.status).toBe('done');
    expect(pack.items.length).toBe(1);
    const prov = pack.items[0].response.solver_meta.provenance;
    expect(prov?.method).toBe('ga');
    if (prov?.method !== 'ga') return;
    expect(prov.config.maxGenerations).toBe(GA_PRESET_DEFS.fast.maxGenerations);
    expect(prov.config.populationSize).toBe(GA_PRESET_DEFS.fast.populationSize);
    expect(prov.config.seed).toBe(3);
  });

  it('parseSolveRunOptions accepts dln preset and custom hyperparameters', () => {
    const parsed = parseSolveRunOptions({
      dln: {
        preset: 'fast',
        lambda: 0.01,
        kappa: 15,
        tol: 1e-5,
        rowScale: false,
        maxIter: 5000,
      },
    });
    expect(parsed?.dln?.preset).toBe('fast');
    expect(parsed?.dln?.lambda).toBe(0.01);
    expect(parsed?.dln?.kappa).toBe(15);
    expect(parsed?.dln?.tol).toBe(1e-5);
    expect(parsed?.dln?.rowScale).toBe(false);
    expect(parsed?.dln?.maxIter).toBe(5000);

    const model = createTask13Model();
    const res = solveLocal(
      model,
      'local',
      0,
      'dln',
      'native',
      parseSolveRunOptions({ dln: { preset: 'fast' } }),
    );
    expect(res.status).toBe('done');
    const prov = res.solver_meta.provenance;
    expect(prov?.method).toBe('dln');
    if (prov?.method === 'dln') {
      expect(prov.config.lambda).toBe(DLN_PRESET_DEFS.fast.lambda);
      expect(prov.config.kappa).toBe(DLN_PRESET_DEFS.fast.kappa);
    }
  });
});
