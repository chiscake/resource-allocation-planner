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
    expect(report.root!.diff.match).toBe(true);
    expect(report.anyMismatch).toBe(false);
  });

  it('compareSolveResults detects Z drift', () => {
    const model = createTask13Model();
    const a = solveLocal(model, 'local', 0, 'lp', 'native').result!;
    const b = { ...a, Z: a.Z + 1 };
    expect(compareSolveResults(a, b).match).toBe(false);
  });
});
