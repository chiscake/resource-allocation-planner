import { describe, expect, it } from 'vitest';
import { DIMETRIC_ALPHA, projectDimetricOrtho, unprojectDimetricOrthoZ0 } from './math';

function angleDeg(a: number[], b: number[]): number {
  const na = Math.hypot(a[0], a[1]);
  const nb = Math.hypot(b[0], b[1]);
  const cos = (a[0] * b[0] + a[1] * b[1]) / (na * nb);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

describe('dimetric orthographic 105/105/150', () => {
  it('projects unit axes with screen angles 105°, 105°, 150°', () => {
    const o = projectDimetricOrtho([0, 0, 0], 1, 0, 0);
    const x = projectDimetricOrtho([1, 0, 0], 1, 0, 0);
    const y = projectDimetricOrtho([0, 1, 0], 1, 0, 0);
    const z = projectDimetricOrtho([0, 0, 1], 1, 0, 0);
    // Screen y is flipped in project (cy - sy); recover direction in math y-up.
    const dirX = [x.x - o.x, -(x.y - o.y)];
    const dirY = [y.x - o.x, -(y.y - o.y)];
    const dirZ = [z.x - o.x, -(z.y - o.y)];

    expect(angleDeg(dirY, dirX)).toBeCloseTo(105, 5);
    expect(angleDeg(dirY, dirZ)).toBeCloseTo(105, 5);
    expect(angleDeg(dirX, dirZ)).toBeCloseTo(150, 5);

    // Y is vertical.
    expect(dirY[0]).toBeCloseTo(0, 9);
    expect(dirY[1]).toBeGreaterThan(0);
    // X down-right, Z down-left.
    expect(dirX[0]).toBeGreaterThan(0);
    expect(dirX[1]).toBeLessThan(0);
    expect(dirZ[0]).toBeLessThan(0);
    expect(dirZ[1]).toBeLessThan(0);
  });

  it('uses α = 15°', () => {
    expect((DIMETRIC_ALPHA * 180) / Math.PI).toBeCloseTo(15, 9);
  });

  it('round-trips unproject on Z=0', () => {
    const p = projectDimetricOrtho([0.4, -0.2, 0], 1, 0, 0);
    const back = unprojectDimetricOrthoZ0(p.x, -p.y);
    expect(back[0]).toBeCloseTo(0.4, 9);
    expect(back[1]).toBeCloseTo(-0.2, 9);
    expect(back[2]).toBeCloseTo(0, 9);
  });
});
