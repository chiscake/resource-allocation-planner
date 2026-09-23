import { describe, expect, it } from "vitest";
import { createTask13Model } from "$lib/domain";
import { solveLocal } from "./run";
import { solveIpmRaw } from "./methods/ipm";
import { solveGaRaw, DEFAULT_GA_HYPERPARAMS } from "./methods/ga";

const TOL = 1e-3;
const IPM_TOL = 1e-2;

describe("solveLocal task13 (lp)", () => {
  it("matches golden base Z and critical resources", () => {
    const model = createTask13Model();
    const res = solveLocal(model, "local", 0, "lp");
    expect(res.status).toBe("done");
    expect(res.result).toBeDefined();
    expect(res.solver_meta.library).toBe("simplex-native@local");
    expect(res.solver_meta.method).toBe("lp");
    expect(res.solver_meta.engine).toBe("native");
    expect(res.result!.Z).toBeCloseTo(150, 2);
    expect(res.result!.x["Частотомер"]).toBeCloseTo(30, 2);
    expect(res.result!.x["Генератор"]).toBeCloseTo(10, 2);
    expect(res.result!.shadow_prices["Труд"]).toBeCloseTo(1.333333, 3);
    expect(res.result!.shadow_prices["Оборудование"]).toBeCloseTo(0.333333, 3);
    expect(res.result!.critical_resources).toEqual(
      expect.arrayContaining(["Труд", "Оборудование"]),
    );
    expect(Math.abs(res.result!.x["Осциллограф"] ?? 0)).toBeLessThan(TOL);
    expect(Math.abs(res.result!.x["Вольтметр"] ?? 0)).toBeLessThan(TOL);
  });

  it("native LP matches golden within 1e-6", () => {
    const model = createTask13Model();
    const res = solveLocal(model, "local", 0, "lp", "native");
    expect(res.status).toBe("done");
    expect(res.solver_meta.engine).toBe("native");
    expect(res.solver_meta.library).toBe("simplex-native@local");
    expect(res.result!.Z).toBeCloseTo(150, 5);
    expect(res.result!.x["Частотомер"]).toBeCloseTo(30, 5);
    expect(res.result!.x["Генератор"]).toBeCloseTo(10, 5);
    expect(res.result!.shadow_prices["Труд"]).toBeCloseTo(1.333333, 4);
    expect(res.result!.shadow_prices["Оборудование"]).toBeCloseTo(0.333333, 4);
    expect(res.trace?.method).toBe("lp");
    if (res.trace?.method === "lp") {
      expect(res.trace.frames.length).toBeGreaterThan(0);
      expect(res.trace.dual_frames?.length).toBeGreaterThan(0);
    }
  });
});

describe("interior-point task13", () => {
  it("agrees with LP golden within eps", () => {
    const model = createTask13Model();
    const raw = solveIpmRaw(model);
    expect(raw.ok).toBe(true);
    if (!raw.ok) return;

    const res = solveLocal(model, "local", 0, "ipm");
    expect(res.status).toBe("done");
    expect(res.solver_meta.library).toBe("interior-point@local");
    expect(res.solver_meta.method).toBe("ipm");
    expect(res.solver_meta.engine).toBe("native");
    expect(res.result!.Z).toBeCloseTo(150, 1);
    expect(res.result!.x["Частотомер"]).toBeCloseTo(30, 0);
    expect(res.result!.x["Генератор"]).toBeCloseTo(10, 0);
    expect(Math.abs(res.result!.x["Осциллограф"] ?? 0)).toBeLessThan(IPM_TOL);
    expect(Math.abs(res.result!.x["Вольтметр"] ?? 0)).toBeLessThan(IPM_TOL);
    expect(res.result!.shadow_prices["Труд"]).toBeCloseTo(1.333333, 1);
    expect(res.result!.shadow_prices["Оборудование"]).toBeCloseTo(0.333333, 1);
    expect(res.result!.critical_resources).toEqual(
      expect.arrayContaining(["Труд", "Оборудование"]),
    );
    expect(res.result!.feasible).toBe(true);
  });
});

describe("ga-evolutionary task13", () => {
  it("returns feasible plan with bounded gap vs LP", () => {
    const model = createTask13Model();
    const res = solveLocal(model, "local", 0, "ga");
    expect(res.status).toBe("done");
    expect(res.solver_meta.library).toBe("ga-evolutionary@local");
    expect(res.solver_meta.method).toBe("ga");
    expect(res.solver_meta.engine).toBe("native");
    expect(res.result).toBeDefined();
    expect(res.result!.feasible).toBe(true);
    // Gap vs LP: allow up to 15% for heuristic (AGENTS: not equality)
    expect(res.result!.Z).toBeGreaterThan(150 * 0.85);
    expect(res.result!.Z).toBeLessThanOrEqual(150 + 1e-3);
    if (res.solver_meta.gap_vs_lp != null) {
      expect(res.solver_meta.gap_vs_lp).toBeLessThan(0.15);
    }
    // Duals filled from LP dual contract
    expect(res.result!.shadow_prices["Труд"]).toBeCloseTo(1.333333, 2);
    expect(Object.keys(res.result!.x)).toEqual(
      expect.arrayContaining(model.products),
    );
  });

  it("raw seed run is deterministic", () => {
    const model = createTask13Model();
    const a = solveGaRaw(model, { ...DEFAULT_GA_HYPERPARAMS, seed: 42 });
    const b = solveGaRaw(model, { ...DEFAULT_GA_HYPERPARAMS, seed: 42 });
    expect(a.x).toEqual(b.x);
  });
});
