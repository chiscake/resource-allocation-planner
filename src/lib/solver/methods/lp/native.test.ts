import { describe, expect, it } from "vitest";
import { createTask13Model } from "$lib/domain";
import { solveLpLibrary } from "./library";
import { solveLpNative, solvePrimalWithTrace, solveDualWithTrace } from "./simplex";
import { lpNativeEngine } from "./native";

const TOL = 1e-6;

describe("lp native simplex (task13)", () => {
  it("matches library Z and x within 1e-6", () => {
    const model = createTask13Model();
    const lib = solveLpLibrary(model);
    const { result, frames, dual_frames } = solveLpNative(model);

    expect(result.feasible).toBe(true);
    expect(result.Z).toBeCloseTo(lib.Z, 5);
    expect(Math.abs(result.Z - lib.Z)).toBeLessThan(TOL);

    for (const p of model.products) {
      expect(Math.abs((result.x[p] ?? 0) - (lib.x[p] ?? 0))).toBeLessThan(TOL);
    }
    for (const r of model.resources) {
      expect(
        Math.abs((result.shadow_prices[r] ?? 0) - (lib.shadow_prices[r] ?? 0)),
      ).toBeLessThan(TOL);
    }

    expect(result.Z).toBeCloseTo(150, 5);
    expect(result.x["Частотомер"]).toBeCloseTo(30, 5);
    expect(result.x["Генератор"]).toBeCloseTo(10, 5);
  });

  it("trace has primal frames and dual_frames", () => {
    const model = createTask13Model();
    const { frames, dual_frames } = solveLpNative(model);
    expect(frames.length).toBeGreaterThan(0);
    expect(dual_frames.length).toBeGreaterThan(0);
    expect(frames[0].problem).toBe("primal");
    expect(dual_frames[0].problem).toBe("dual");
    expect(frames[0].matrix?.length).toBeGreaterThan(0);
    expect(frames.some((f) => f.phase === 2)).toBe(true);
  });

  it("engine solve returns ok with trace", () => {
    const model = createTask13Model();
    const out = lpNativeEngine.solve(model);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.result.Z).toBeCloseTo(150, 5);
    expect(out.value.trace?.method).toBe("lp");
    if (out.value.trace?.method === "lp") {
      expect(out.value.trace.frames.length).toBeGreaterThan(0);
      expect(out.value.trace.dual_frames?.length).toBeGreaterThan(0);
    }
  });

  it("primal and dual objectives agree (strong duality)", () => {
    const model = createTask13Model();
    const primal = solvePrimalWithTrace(model);
    const dual = solveDualWithTrace(model);
    expect(primal.ok).toBe(true);
    expect(dual.ok).toBe(true);
    if (!primal.ok || !dual.ok) return;
    expect(Math.abs(primal.Z - dual.Z)).toBeLessThan(TOL);
  });
});
