import { describe, expect, it } from 'vitest';
import { createBlankModel, createTask13Model } from './task13';
import { cloneModel } from './mutations';
import type { SolveResult } from './types';
import {
  COMPARE_MAX_IDS,
  assessMatrixCompatibility,
  formatCompareIds,
  nodeIdsEqual,
  parseCompareIds,
  planDeltas,
} from './compare-tasks';

function result(
  partial: Partial<SolveResult> & { Z: number; x: Record<string, number> },
): SolveResult {
  return {
    resource_usage: {},
    resource_slack: {},
    shadow_prices: {},
    critical_resources: [],
    non_critical_resources: [],
    feasible: true,
    ...partial,
  };
}

describe('assessMatrixCompatibility', () => {
  it('returns null when headers and units match', () => {
    const a = createTask13Model();
    const b = cloneModel(a);
    expect(assessMatrixCompatibility(a, b)).toBeNull();
  });

  it('detects dimension mismatch', () => {
    const a = createTask13Model();
    const b = createBlankModel();
    expect(assessMatrixCompatibility(a, b)).toBe('dimension');
  });

  it('detects name mismatch at same length', () => {
    const a = createBlankModel();
    a.products = ['A', 'B'];
    a.resources = ['R'];
    a.A = [[1, 1]];
    a.b = [1];
    a.c = [1, 1];
    const b = cloneModel(a);
    b.products = ['B', 'A'];
    expect(assessMatrixCompatibility(a, b)).toBe('names');
  });

  it('detects unit mismatch when names match', () => {
    const a = createBlankModel();
    a.products = ['A'];
    a.resources = ['R'];
    a.A = [[1]];
    a.b = [1];
    a.c = [1];
    a.product_units = ['шт'];
    a.resource_units = ['ч'];
    a.objective_unit = 'у.е.';
    const b = cloneModel(a);
    b.product_units = ['кг'];
    expect(assessMatrixCompatibility(a, b)).toBe('units');
  });

  it('treats missing units as empty string', () => {
    const a = createBlankModel();
    a.products = ['A'];
    a.resources = ['R'];
    a.A = [[1]];
    a.b = [1];
    a.c = [1];
    const b = cloneModel(a);
    b.product_units = [''];
    b.resource_units = [''];
    expect(assessMatrixCompatibility(a, b)).toBeNull();
  });
});

describe('planDeltas', () => {
  it('computes signed Δ and %', () => {
    const primary = result({ Z: 100, x: { A: 10, B: 2 } });
    const other = result({ Z: 110, x: { A: 12, B: 2 } });
    const d = planDeltas(primary, other);
    expect(d.deltaZ).toBe(10);
    expect(d.pctZ).toBeCloseTo(10);
    expect(d.perProduct.find((p) => p.name === 'A')).toEqual({
      name: 'A',
      delta: 2,
      pct: 20,
    });
    expect(d.perProduct.find((p) => p.name === 'B')?.delta).toBe(0);
  });

  it('returns null pct when primary is ~0', () => {
    const primary = result({ Z: 0, x: { A: 0 } });
    const other = result({ Z: 5, x: { A: 1 } });
    const d = planDeltas(primary, other);
    expect(d.pctZ).toBeNull();
    expect(d.perProduct[0]?.pct).toBeNull();
  });

  it('lists only-primary / only-other products', () => {
    const primary = result({ Z: 1, x: { A: 1, B: 1 } });
    const other = result({ Z: 1, x: { B: 2, C: 3 } });
    const d = planDeltas(primary, other);
    expect(d.onlyPrimary).toEqual(['A']);
    expect(d.onlyOther).toEqual(['C']);
    expect(d.perProduct.map((p) => p.name)).toEqual(['B']);
  });

  it('computes shadow and slack deltas', () => {
    const primary = result({
      Z: 1,
      x: {},
      shadow_prices: { R: 1.3, S: 0 },
      resource_slack: { R: 0, S: 10 },
    });
    const other = result({
      Z: 1,
      x: {},
      shadow_prices: { R: 1.0, S: 0.2 },
      resource_slack: { R: 2, S: 8 },
    });
    const d = planDeltas(primary, other);
    expect(d.perShadow.find((r) => r.name === 'R')?.delta).toBeCloseTo(-0.3);
    expect(d.perSlack.find((r) => r.name === 'S')?.delta).toBe(-2);
  });
});

describe('parseCompareIds / formatCompareIds', () => {
  it('parses unique capped ids', () => {
    expect(parseCompareIds(' a,b, a,c,d,e ')).toEqual(['a', 'b', 'c', 'd']);
    expect(parseCompareIds('a,b,c,d').length).toBe(COMPARE_MAX_IDS);
  });

  it('round-trips format', () => {
    expect(formatCompareIds(['x', 'y', 'x', ''])).toBe('x,y');
    expect(parseCompareIds(formatCompareIds(['1', '2', '3']))).toEqual(['1', '2', '3']);
  });

  it('empty raw → []', () => {
    expect(parseCompareIds(null)).toEqual([]);
    expect(parseCompareIds('')).toEqual([]);
  });
});

describe('nodeIdsEqual', () => {
  it('compares ordered arrays', () => {
    expect(nodeIdsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(nodeIdsEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});
