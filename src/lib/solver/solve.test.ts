import { describe, expect, it } from "vitest";
import { createTask13Model } from "$lib/domain";
import { solveLocal } from "./solve";

const TOL = 1e-3;

describe("solveLocal task13", () => {
  it("matches golden base Z and critical resources", () => {
    const model = createTask13Model();
    const res = solveLocal(model);
    expect(res.status).toBe("done");
    expect(res.result).toBeDefined();
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
});
