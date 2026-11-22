import { describe, expect, it } from 'vitest';
import { boundingCenterScale, normalizePoint } from './math';

/** Cross-product length of two 3-vectors (0 ⇒ parallel). */
function crossLen(a: number[], b: number[]): number {
  const cx = a[1] * b[2] - a[2] * b[1];
  const cy = a[2] * b[0] - a[0] * b[2];
  const cz = a[0] * b[1] - a[1] * b[0];
  return Math.hypot(cx, cy, cz);
}

describe('3D view fit for axes vs polytope', () => {
  const cubeVerts = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];

  it('keeps axis tip collinear with cube edge when fit excludes the tip', () => {
    const origin = [0, 0, 0];
    const corner = [1, 0, 0];
    const tip = [1.08, 0, 0];
    const fit = boundingCenterScale(cubeVerts, 1);
    const nO = normalizePoint(origin, fit.center, fit.scale);
    const nC = normalizePoint(corner, fit.center, fit.scale);
    const nT = normalizePoint(tip, fit.center, fit.scale);
    const edge = [nC[0] - nO[0], nC[1] - nO[1], nC[2] - nO[2]];
    const axis = [nT[0] - nO[0], nT[1] - nO[1], nT[2] - nO[2]];
    expect(crossLen(edge, axis)).toBeLessThan(1e-9);
  });

  it('skews when tip is folded into the fit (regression of the old bug)', () => {
    const origin = [0, 0, 0];
    const corner = [1, 0, 0];
    const tip = [1.08, 0, 0];
    const fitGeom = boundingCenterScale(cubeVerts, 1);
    const fitTip = boundingCenterScale([...cubeVerts, tip], 1);
    const nO = normalizePoint(origin, fitGeom.center, fitGeom.scale);
    const nC = normalizePoint(corner, fitGeom.center, fitGeom.scale);
    const nT = normalizePoint(tip, fitTip.center, fitTip.scale);
    const edge = [nC[0] - nO[0], nC[1] - nO[1], nC[2] - nO[2]];
    const axis = [nT[0] - nO[0], nT[1] - nO[1], nT[2] - nO[2]];
    expect(crossLen(edge, axis)).toBeGreaterThan(1e-3);
  });
});
