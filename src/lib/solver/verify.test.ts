import { describe, expect, it } from 'vitest';
import { createTask13Model } from '$lib/domain';
import { solveLocal } from './run';
import { compareSolveResults, verifyAgainstLibrary } from './verify';

describe('verifyAgainstLibrary', () => {
  it('matches native vs library on task13', () => {
    const model = createTask13Model();
    const native = solveLocal(model, 'local', 0, 'lp', 'native');
    expect(native.status).toBe('done');
    const report = verifyAgainstLibrary(model, native, 'lp');
    expect(report.root).not.toBeNull();
    expect(report.root!.diff.kind).toBe('equal');
    expect(report.anyMismatch).toBe(false);
    expect(report.anyAlternate).toBe(false);
  });

  it('compareSolveResults detects Z drift as mismatch', () => {
    const model = createTask13Model();
    const a = solveLocal(model, 'local', 0, 'lp', 'native').result!;
    const b = { ...a, Z: a.Z + 1 };
    expect(compareSolveResults(a, b).kind).toBe('mismatch');
  });

  it('compareSolveResults flags same Z different x as alternate_optima', () => {
    const model = createTask13Model();
    const a = solveLocal(model, 'local', 0, 'lp', 'native').result!;
    const productKeys = Object.keys(a.x);
    expect(productKeys.length).toBeGreaterThan(0);
    const k0 = productKeys[0]!;
    const b = {
      ...a,
      x: { ...a.x, [k0]: (a.x[k0] ?? 0) + 3 },
    };
    const diff = compareSolveResults(a, b);
    expect(diff.kind).toBe('alternate_optima');
    expect(diff.dZ).toBe(0);
    expect(diff.maxAbsDx).toBeGreaterThan(1);
  });
});
