import { describe, expect, it } from 'vitest';
import { cloneModel, createTask13Model } from '$lib/domain';
import { solveLocal } from './run';
import { solveIpmRaw } from './methods/ipm';
import { solveGaRaw, DEFAULT_GA_HYPERPARAMS } from './methods/ga';
import { buildStandardForm, DLN_PRESET_DEFS, solveDlnRaw, sumBound } from './methods/dln';

const TOL = 1e-3;
const IPM_TOL = 1e-2;

describe('solveLocal task13 (lp)', () => {
  it('matches golden base Z and critical resources', () => {
    const model = createTask13Model();
    const res = solveLocal(model, 'local', 0, 'lp');
    expect(res.status).toBe('done');
    expect(res.result).toBeDefined();
    expect(res.solver_meta.library).toBe('simplex-native@local');
    expect(res.solver_meta.method).toBe('lp');
    expect(res.solver_meta.engine).toBe('native');
    expect(res.result!.Z).toBeCloseTo(150, 2);
    expect(res.result!.x['Частотомер']).toBeCloseTo(30, 2);
    expect(res.result!.x['Генератор']).toBeCloseTo(10, 2);
    expect(res.result!.shadow_prices['Труд']).toBeCloseTo(1.333333, 3);
    expect(res.result!.shadow_prices['Оборудование']).toBeCloseTo(0.333333, 3);
    expect(res.result!.critical_resources).toEqual(
      expect.arrayContaining(['Труд', 'Оборудование']),
    );
    expect(Math.abs(res.result!.x['Осциллограф'] ?? 0)).toBeLessThan(TOL);
    expect(Math.abs(res.result!.x['Вольтметр'] ?? 0)).toBeLessThan(TOL);
  });

  it('native LP matches golden within 1e-6', () => {
    const model = createTask13Model();
    const res = solveLocal(model, 'local', 0, 'lp', 'native');
    expect(res.status).toBe('done');
    expect(res.solver_meta.engine).toBe('native');
    expect(res.solver_meta.library).toBe('simplex-native@local');
    expect(res.result!.Z).toBeCloseTo(150, 5);
    expect(res.result!.x['Частотомер']).toBeCloseTo(30, 5);
    expect(res.result!.x['Генератор']).toBeCloseTo(10, 5);
    expect(res.result!.shadow_prices['Труд']).toBeCloseTo(1.333333, 4);
    expect(res.result!.shadow_prices['Оборудование']).toBeCloseTo(0.333333, 4);
    expect(res.trace?.method).toBe('lp');
    if (res.trace?.method === 'lp') {
      expect(res.trace.frames.length).toBeGreaterThan(0);
      expect(res.trace.dual_frames?.length).toBeGreaterThan(0);
    }
  });
});

describe('interior-point task13', () => {
  it('agrees with LP golden within eps', () => {
    const model = createTask13Model();
    const raw = solveIpmRaw(model);
    expect(raw.ok).toBe(true);
    if (!raw.ok) return;

    const res = solveLocal(model, 'local', 0, 'ipm');
    expect(res.status).toBe('done');
    expect(res.solver_meta.library).toBe('interior-point@local');
    expect(res.solver_meta.method).toBe('ipm');
    expect(res.solver_meta.engine).toBe('native');
    expect(res.result!.Z).toBeCloseTo(150, 1);
    expect(res.result!.x['Частотомер']).toBeCloseTo(30, 0);
    expect(res.result!.x['Генератор']).toBeCloseTo(10, 0);
    expect(Math.abs(res.result!.x['Осциллограф'] ?? 0)).toBeLessThan(IPM_TOL);
    expect(Math.abs(res.result!.x['Вольтметр'] ?? 0)).toBeLessThan(IPM_TOL);
    expect(res.result!.shadow_prices['Труд']).toBeCloseTo(1.333333, 1);
    expect(res.result!.shadow_prices['Оборудование']).toBeCloseTo(0.333333, 1);
    expect(res.result!.critical_resources).toEqual(
      expect.arrayContaining(['Труд', 'Оборудование']),
    );
    expect(res.result!.feasible).toBe(true);
  });

  it('solves degenerate 2×2 with alternate optima (c ∥ constraint)', () => {
    const t13 = createTask13Model();
    const model = cloneModel(t13);
    model.products = ['Продукт 1', 'Продукт 2'];
    model.resources = ['Ресурс 1', 'Ресурс 2'];
    model.A = [
      [1, 2],
      [3, 4],
    ];
    model.b = [10, 20];
    model.c = [100, 200];
    const raw = solveIpmRaw(model);
    expect(raw.ok).toBe(true);
    if (!raw.ok) return;
    expect(raw.feasible).toBe(true);
    expect(raw.Z).toBeCloseTo(1000, 0);
    const res = solveLocal(model, 'local', 0, 'ipm');
    expect(res.status).toBe('done');
    expect(res.result!.Z).toBeCloseTo(1000, 0);
  });
});

describe('ga-evolutionary task13', () => {
  it('returns feasible plan with bounded gap vs LP', () => {
    const model = createTask13Model();
    const res = solveLocal(model, 'local', 0, 'ga');
    expect(res.status).toBe('done');
    expect(res.solver_meta.library).toBe('ga-evolutionary@local');
    expect(res.solver_meta.method).toBe('ga');
    expect(res.solver_meta.engine).toBe('native');
    expect(res.result).toBeDefined();
    expect(res.result!.feasible).toBe(true);
    // Gap vs LP: allow up to 15% for heuristic (AGENTS: not equality)
    expect(res.result!.Z).toBeGreaterThan(150 * 0.85);
    expect(res.result!.Z).toBeLessThanOrEqual(150 + 1e-3);
    if (res.solver_meta.gap_vs_lp != null) {
      expect(res.solver_meta.gap_vs_lp).toBeLessThan(0.15);
    }
    // Duals filled from LP dual contract
    expect(res.result!.shadow_prices['Труд']).toBeCloseTo(1.333333, 2);
    expect(Object.keys(res.result!.x)).toEqual(expect.arrayContaining(model.products));
  });

  it('raw seed run is deterministic', () => {
    const model = createTask13Model();
    const a = solveGaRaw(model, { ...DEFAULT_GA_HYPERPARAMS, seed: 42 });
    const b = solveGaRaw(model, { ...DEFAULT_GA_HYPERPARAMS, seed: 42 });
    expect(a.x).toEqual(b.x);
  });
});

describe('dln-diagonal task13', () => {
  it('sumBound matches lp-compare illustrative reference (690)', () => {
    const model = createTask13Model();
    expect(sumBound(buildStandardForm(model))).toBeCloseTo(690, 10);
  });

  it('returns feasible plan with bounded gap vs LP, duals, and provenance on precise preset', () => {
    const model = createTask13Model();
    const res = solveLocal(model, 'local', 0, 'dln', 'native', {
      dln: { preset: 'precise' },
    });
    expect(res.status).toBe('done');
    expect(res.solver_meta.library).toBe('dln-diagonal@local');
    expect(res.solver_meta.method).toBe('dln');
    expect(res.solver_meta.engine).toBe('native');
    expect(res.result).toBeDefined();
    expect(res.result!.feasible).toBe(true);
    expect(res.result!.Z).toBeGreaterThan(150 * 0.9);
    expect(res.result!.Z).toBeLessThanOrEqual(150 + 1e-2);
    expect(res.solver_meta.gap_vs_lp).toBeDefined();
    expect(res.solver_meta.gap_vs_lp!).toBeLessThan(0.1);
    expect(res.result!.shadow_prices['Труд']).toBeCloseTo(1.333333, 2);
    expect(res.result!.shadow_prices['Оборудование']).toBeCloseTo(0.333333, 2);
    const prov = res.solver_meta.provenance;
    expect(prov?.method).toBe('dln');
    if (prov?.method === 'dln') {
      expect(prov.config.lambda).toBe(DLN_PRESET_DEFS.precise.lambda);
      expect(prov.config.kappa).toBe(DLN_PRESET_DEFS.precise.kappa);
      expect(prov.iterations).toBeGreaterThan(0);
      expect(Number.isFinite(prov.residual)).toBe(true);
    }
  });

  it('stops with done and stopReason max_iter when iteration budget is exhausted', () => {
    const model = createTask13Model();
    const res = solveLocal(model, 'local', 0, 'dln', 'native', {
      dln: {
        preset: 'custom',
        lambda: 0.005,
        kappa: 3,
        tol: 1e-12,
        rowScale: true,
        maxIter: 25,
      },
    });
    expect(res.status).toBe('done');
    const prov = res.solver_meta.provenance;
    expect(prov?.method).toBe('dln');
    if (prov?.method === 'dln') {
      expect(prov.stopReason).toBe('max_iter');
      expect(prov.iterations).toBe(25);
      expect(prov.residual).toBeGreaterThan(0);
    }
  });

  it('rejects model with negative A entry as unsupported', () => {
    const model = cloneModel(createTask13Model());
    model.A[0][0] = -1;
    const raw = solveDlnRaw(model);
    expect(raw.ok).toBe(false);
    if (!raw.ok) {
      expect(raw.reason).toBe('dln_unsupported_negative_a');
    }
    const res = solveLocal(model, 'local', 0, 'dln');
    expect(res.status).toBe('rejected_too_large');
    expect(res.solver_meta.rejected_reason).toBe('dln_unsupported_negative_a');
    expect(res.solver_meta.hint).toBe('dln_unsupported');
  });
});
