import { describe, expect, it } from 'vitest';
import {
  VIEW_TOWARD_CAMERA,
  WORLD_UP,
  applyTrackballOrbit,
  applyTurntableOrbit,
  arcballDelta,
  projectViewOrtho,
  quatConjugate,
  quatForSnap,
  quatForViewFrom,
  quatIdentity,
  quatSlerp,
  rotateByQuat,
  snapLookFrom,
} from './math';

function approxUnit(v: number[]) {
  const n = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  expect(n).toBeCloseTo(1, 5);
}

function lookFromOf(q: ReturnType<typeof quatIdentity>) {
  return rotateByQuat(VIEW_TOWARD_CAMERA, quatConjugate(q));
}

describe('orbit / view snaps', () => {
  it('quatForViewFrom maps lookFrom toward camera (+Z view)', () => {
    const q = quatForViewFrom([1, 0, 0]);
    const imaged = rotateByQuat([1, 0, 0], q);
    expect(imaged[2]).toBeCloseTo(1, 5);
    expect(Math.abs(imaged[0] ?? 0)).toBeLessThan(1e-5);
    expect(Math.abs(imaged[1] ?? 0)).toBeLessThan(1e-5);
    approxUnit(imaged);
  });

  it('turntable yaw changes azimuth around world Z', () => {
    const q0 = quatForViewFrom([1, 1, 0.2]);
    const q1 = applyTurntableOrbit(q0, 40, 0, 0.01);
    const look0 = lookFromOf(q0);
    const look1 = lookFromOf(q1);
    const az0 = Math.atan2(look0[1] ?? 0, look0[0] ?? 0);
    const az1 = Math.atan2(look1[1] ?? 0, look1[0] ?? 0);
    expect(Math.abs(az1 - az0)).toBeGreaterThan(0.2);
    // Elevation (Z of lookFrom) roughly preserved on pure yaw.
    expect(look1[2]).toBeCloseTo(look0[2] ?? 0, 2);
  });

  it('turntable pitch through the Z pole is continuous (no snap-back)', () => {
    let q = quatForViewFrom([1, 0.15, 0.05]);
    const looks: number[][] = [];
    for (let i = 0; i < 100; i++) {
      q = applyTurntableOrbit(q, 0, 25, 0.01);
      looks.push(lookFromOf(q));
    }
    let maxStep = 0;
    for (let i = 1; i < looks.length; i++) {
      const d = Math.hypot(
        (looks[i][0] ?? 0) - (looks[i - 1][0] ?? 0),
        (looks[i][1] ?? 0) - (looks[i - 1][1] ?? 0),
        (looks[i][2] ?? 0) - (looks[i - 1][2] ?? 0),
      );
      maxStep = Math.max(maxStep, d);
    }
    // Continuous path on the unit sphere — no discontinuous jump.
    expect(maxStep).toBeLessThan(0.45);
    // Must have crossed to the other hemisphere (full pitch).
    const zSigns = looks.map((l) => Math.sign(l[2] ?? 0));
    expect(zSigns.some((s) => s > 0) && zSigns.some((s) => s < 0)).toBe(true);
  });

  it('trackball applies arcball delta without requiring Z-up', () => {
    const q0 = quatIdentity();
    const delta = arcballDelta({ x: 100, y: 100 }, { x: 180, y: 40 }, 400, 300);
    const q1 = applyTrackballOrbit(q0, delta);
    expect(q1).not.toEqual(q0);
    const zView = rotateByQuat(WORLD_UP, q1);
    expect(Math.hypot(zView[0] ?? 0, zView[1] ?? 0, zView[2] ?? 0)).toBeCloseTo(1, 5);
  });

  it('axis snap puts face in view plane as a square', () => {
    const q = quatForSnap('pz');
    const o = rotateByQuat([0, 0, 0], q);
    const x = rotateByQuat([1, 0, 0], q);
    const y = rotateByQuat([0, 1, 0], q);
    expect(Math.abs((x[2] ?? 0) - (o[2] ?? 0))).toBeLessThan(1e-6);
    expect(Math.abs((y[2] ?? 0) - (o[2] ?? 0))).toBeLessThan(1e-6);

    const sx = projectViewOrtho(x, 1, 0, 0);
    const sy = projectViewOrtho(y, 1, 0, 0);
    const so = projectViewOrtho(o, 1, 0, 0);
    const lx = Math.hypot(sx.x - so.x, sx.y - so.y);
    const ly = Math.hypot(sy.x - so.x, sy.y - so.y);
    expect(lx).toBeCloseTo(ly, 5);
    expect(lx).toBeCloseTo(1, 5);
    expect(snapLookFrom('px')).toEqual([1, 0, 0]);
  });

  it('+X snap faces the camera squarely', () => {
    const q = quatForSnap('px');
    const n = rotateByQuat([1, 0, 0], q);
    expect(n[2]).toBeCloseTo(1, 5);
    const y = rotateByQuat([0, 1, 0], q);
    const z = rotateByQuat([0, 0, 1], q);
    expect(Math.abs(y[2] ?? 0)).toBeLessThan(1e-5);
    expect(Math.abs(z[2] ?? 0)).toBeLessThan(1e-5);
    const ly = Math.hypot(y[0] ?? 0, y[1] ?? 0);
    const lz = Math.hypot(z[0] ?? 0, z[1] ?? 0);
    expect(ly).toBeCloseTo(lz, 5);
  });

  it('quatSlerp endpoints', () => {
    const a = quatIdentity();
    const b = quatForSnap('px');
    const mid = quatSlerp(a, b, 0.5);
    expect(quatSlerp(a, b, 0)).toEqual(a);
    expect(quatSlerp(a, b, 1)[0]).toBeCloseTo(b[0], 5);
    expect(mid[0]).not.toBeCloseTo(a[0], 3);
  });
});
