import { describe, expect, it } from "vitest";
import { createTask13Model, type SolveResult } from "$lib/domain";
import {
  maybeRoundPlan,
  roundPlanNearest,
  withRoundingMeta,
} from "./roundPlan";
import { solveLocal } from "./solve";

function baseResult(partial: Partial<SolveResult> & Pick<SolveResult, "x" | "Z">): SolveResult {
  return {
    resource_usage: {},
    resource_slack: {},
    shadow_prices: { Труд: 1.333, Оборудование: 0.333 },
    critical_resources: ["Труд", "Оборудование"],
    non_critical_resources: ["Сырье"],
    feasible: true,
    ...partial,
  };
}

describe("roundPlanNearest", () => {
  it("rounds each x_i to nearest integer and recomputes Z from c", () => {
    const model = createTask13Model();
    const continuous = baseResult({
      x: {
        Осциллограф: 0.4,
        Частотомер: 29.6,
        Генератор: 10.5,
        Вольтметр: 0.49,
      },
      Z: 999,
    });
    const rounded = roundPlanNearest(model, continuous);
    expect(rounded.x["Осциллограф"]).toBe(0);
    expect(rounded.x["Частотомер"]).toBe(30);
    expect(rounded.x["Генератор"]).toBe(11);
    expect(rounded.x["Вольтметр"]).toBe(0);
    // Z = 3*0 + 4*30 + 3*11 + 1*0 = 153
    expect(rounded.Z).toBe(153);
  });

  it("keeps continuous duals / critical sets", () => {
    const model = createTask13Model();
    const continuous = baseResult({
      x: { Осциллограф: 0, Частотомер: 30, Генератор: 10, Вольтметр: 0 },
      Z: 150,
    });
    const rounded = roundPlanNearest(model, continuous);
    expect(rounded.shadow_prices).toEqual(continuous.shadow_prices);
    expect(rounded.critical_resources).toEqual(continuous.critical_resources);
    expect(rounded.non_critical_resources).toEqual(
      continuous.non_critical_resources,
    );
  });

  it("marks infeasible when A x exceeds b after rounding up", () => {
    const model = createTask13Model();
    // Continuous near capacity; rounding Генератор 10.6 → 11 pushes labor/equipment.
    const continuous = baseResult({
      x: {
        Осциллограф: 0,
        Частотомер: 30,
        Генератор: 10.6,
        Вольтметр: 0,
      },
      Z: 151.8,
    });
    const rounded = roundPlanNearest(model, continuous);
    expect(rounded.x["Генератор"]).toBe(11);
    // labor: 2*30 + 2*11 = 82 > 80
    expect(rounded.resource_usage["Труд"]).toBe(82);
    expect(rounded.resource_slack["Труд"]).toBe(-2);
    expect(rounded.feasible).toBe(false);
  });

  it("stays feasible when rounded plan fits (task13 integers)", () => {
    const model = createTask13Model();
    const res = solveLocal(model);
    expect(res.status).toBe("done");
    const rounded = roundPlanNearest(model, res.result!);
    expect(rounded.x["Частотомер"]).toBe(30);
    expect(rounded.x["Генератор"]).toBe(10);
    expect(rounded.Z).toBeCloseTo(150, 5);
    expect(rounded.feasible).toBe(true);
    expect(rounded.resource_usage["Труд"]).toBeCloseTo(80, 5);
  });

  it("rounds near-zero fractions to zero", () => {
    const model = createTask13Model();
    const continuous = baseResult({
      x: {
        Осциллограф: 1e-9,
        Частотомер: 0.2,
        Генератор: -0.2,
        Вольтметр: 0.5,
      },
      Z: 0,
    });
    const rounded = roundPlanNearest(model, continuous);
    expect(rounded.x["Осциллограф"]).toBe(0);
    expect(rounded.x["Частотомер"]).toBe(0);
    expect(rounded.x["Генератор"]).toBe(0);
    expect(rounded.x["Вольтметр"]).toBe(1);
  });

  it("maybeRoundPlan is a no-op when disabled", () => {
    const model = createTask13Model();
    const continuous = baseResult({
      x: { Осциллограф: 0.7, Частотомер: 0, Генератор: 0, Вольтметр: 0 },
      Z: 2.1,
    });
    expect(maybeRoundPlan(model, continuous, false)).toBe(continuous);
    expect(maybeRoundPlan(model, continuous, true).x["Осциллограф"]).toBe(1);
  });

  it("withRoundingMeta sets hint and rounding method", () => {
    const meta = withRoundingMeta(
      { venue: "local", library: "javascript-lp-solver", duration_ms: 1 },
      true,
    );
    expect(meta.hint).toBe("rounded");
    expect(meta.rounding).toBe("nearest");
    expect(
      withRoundingMeta(
        { venue: "local", library: "javascript-lp-solver", duration_ms: 1 },
        false,
      ).rounding,
    ).toBeUndefined();
  });
});
