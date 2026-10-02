import { describe, expect, it } from "vitest";
import {
  applyOrbit4,
  defaultRot4,
  dragAxisTip4,
  mat4Apply,
  mat4Arc,
  mat4ArcMat,
  mat4Col,
  mat4Identity,
  mat4Mul,
  mat4Orthonormalize,
  mat4PlaneRot,
  mat4Rotate,
  snapAxisTowardCamera4,
} from "./math";

function expectOrthonormal(M: number[]) {
  for (let i = 0; i < 4; i++) {
    const ci = mat4Col(M, i);
    const n = Math.hypot(ci[0]!, ci[1]!, ci[2]!, ci[3]!);
    expect(n).toBeCloseTo(1, 5);
    for (let j = i + 1; j < 4; j++) {
      const cj = mat4Col(M, j);
      const d =
        ci[0]! * cj[0]! +
        ci[1]! * cj[1]! +
        ci[2]! * cj[2]! +
        ci[3]! * cj[3]!;
      expect(Math.abs(d)).toBeLessThan(1e-5);
    }
  }
}

describe("mat4 4D rotations", () => {
  it("planeRot(0,3) rotates e0 into e3", () => {
    const R = mat4PlaneRot(0, 3, Math.PI / 2);
    const v = mat4Apply(R, [1, 0, 0, 0]);
    expect(v[0]).toBeCloseTo(0, 5);
    expect(v[3]).toBeCloseTo(1, 5);
  });

  it("defaultRot4 stays orthonormal", () => {
    expectOrthonormal(defaultRot4());
  });

  it("orbit and tip-drag keep orthonormality", () => {
    let R = defaultRot4();
    R = applyOrbit4(R, 12, -8, false);
    R = applyOrbit4(R, 5, 9, true);
    R = dragAxisTip4(R, 0, 1, 20, -10, false, 56);
    R = dragAxisTip4(R, 3, 1, 8, 14, true, 56);
    expectOrthonormal(R);
  });

  it("snap arc aligns axis toward +Z", () => {
    const R0 = defaultRot4();
    const arc = snapAxisTowardCamera4(R0, 0, 1);
    expect(arc).not.toBeNull();
    const R1 = mat4Rotate(R0, mat4ArcMat(arc!, 1));
    const tip = mat4Col(R1, 0);
    expect(tip[2]).toBeCloseTo(1, 4);
    expect(Math.abs(tip[0]!)).toBeLessThan(1e-3);
    expect(Math.abs(tip[1]!)).toBeLessThan(1e-3);
  });

  it("arc of identical directions is null", () => {
    expect(mat4Arc([0, 0, 1, 0], [0, 0, 2, 0])).toBeNull();
  });

  it("mul(I,I) is I", () => {
    const I = mat4Identity();
    expect(mat4Mul(I, I)).toEqual(I);
    expect(mat4Orthonormalize(I)).toEqual(I);
  });
});
