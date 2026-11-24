import { describe, expect, it } from 'vitest';
import { createTask13Model } from '$lib/domain';
import { computeSensitivityRanges, sampleZVsResource } from './sensitivity-ranges';

const TOL = 1e-6;

describe('sensitivity ranges (task 13)', () => {
  it('matches known optimum, duals, slack, and labor interval', () => {
    const model = createTask13Model();
    const sens = computeSensitivityRanges(model);
    expect(sens).not.toBeNull();
    if (!sens) return;

    expect(sens.Z).toBeCloseTo(150, 6);

    const labor = sens.rhs.find((r) => r.resource === 'Труд')!;
    const raw = sens.rhs.find((r) => r.resource === 'Сырье')!;
    const equip = sens.rhs.find((r) => r.resource === 'Оборудование')!;

    expect(labor.shadowPrice).toBeCloseTo(4 / 3, 6);
    expect(raw.shadowPrice).toBeCloseTo(0, 6);
    expect(equip.shadowPrice).toBeCloseTo(1 / 3, 6);

    // Raw-material slack at optimum = 200 (non-critical).
    expect(raw.allowDecrease).toBeCloseTo(200, 5);

    // b1 ∈ [65; 230]
    expect(labor.lower).toBeCloseTo(65, 5);
    expect(labor.upper).toBeCloseTo(230, 5);
    expect(labor.allowDecrease).toBeCloseTo(15, 5);
    expect(labor.allowIncrease).toBeCloseTo(150, 5);
  });

  it('checks remaining b_i and c_j intervals independently', () => {
    const model = createTask13Model();
    const sens = computeSensitivityRanges(model)!;

    const raw = sens.rhs.find((r) => r.resource === 'Сырье')!;
    const equip = sens.rhs.find((r) => r.resource === 'Оборудование')!;

    // b2: decrease by slack 200, increase unbounded (shadow 0 / non-binding).
    expect(raw.lower).toBeCloseTo(280, 5);
    expect(raw.upper).toBe(Number.POSITIVE_INFINITY);
    expect(raw.allowIncrease).toBe(Number.POSITIVE_INFINITY);
    expect(raw.allowDecrease).toBeCloseTo(200, 5);

    // b3 ∈ [40; 160]
    expect(equip.lower).toBeCloseTo(40, 5);
    expect(equip.upper).toBeCloseTo(160, 5);
    expect(equip.allowDecrease).toBeCloseTo(90, 5);
    expect(equip.allowIncrease).toBeCloseTo(30, 5);

    const osc = sens.objective.find((r) => r.product === 'Осциллограф')!;
    const freq = sens.objective.find((r) => r.product === 'Частотомер')!;
    const gen = sens.objective.find((r) => r.product === 'Генератор')!;
    const volt = sens.objective.find((r) => r.product === 'Вольтметр')!;

    expect(osc.basic).toBe(false);
    expect(volt.basic).toBe(false);
    expect(freq.basic).toBe(true);
    expect(gen.basic).toBe(true);

    // Nonbasic reduced costs ĉ = c − πA
    expect(osc.reducedCost).toBeCloseTo(-7, 5);
    expect(volt.reducedCost).toBeCloseTo(-29 / 3, 5);
    expect(freq.reducedCost).toBeCloseTo(0, 5);
    expect(gen.reducedCost).toBeCloseTo(0, 5);

    // Nonbasic: can raise c until reduced cost hits 0; decrease unbounded.
    expect(osc.allowIncrease).toBeCloseTo(7, 5);
    expect(osc.allowDecrease).toBe(Number.POSITIVE_INFINITY);
    expect(osc.upper).toBeCloseTo(10, 5);
    expect(osc.lower).toBe(Number.NEGATIVE_INFINITY);

    expect(volt.allowIncrease).toBeCloseTo(29 / 3, 5);
    expect(volt.upper).toBeCloseTo(1 + 29 / 3, 5);
    expect(volt.lower).toBe(Number.NEGATIVE_INFINITY);

    // Basic x2 (Частотомер): c ∈ [3; 12]
    expect(freq.lower).toBeCloseTo(3, 5);
    expect(freq.upper).toBeCloseTo(12, 5);
    expect(freq.allowDecrease).toBeCloseTo(1, 5);
    expect(freq.allowIncrease).toBeCloseTo(8, 5);

    // Basic x3 (Генератор): c ∈ [1.25; 4]
    expect(gen.lower).toBeCloseTo(1.25, 5);
    expect(gen.upper).toBeCloseTo(4, 5);
    expect(gen.allowDecrease).toBeCloseTo(1.75, 5);
    expect(gen.allowIncrease).toBeCloseTo(1, 5);
  });

  it('samples Z(b_labor) with slope = shadow price inside the interval', () => {
    const model = createTask13Model();
    const samples = sampleZVsResource(model, 0, { points: 17, padRatio: 0 });
    expect(samples.length).toBe(17);
    const inside = samples.filter((s) => s.insideInterval && Number.isFinite(s.Z));
    expect(inside.length).toBeGreaterThan(2);
    // Analytic piece: Z(b) = 150 + (4/3)(b − 80)
    for (const s of inside) {
      expect(s.Z).toBeCloseTo(150 + (4 / 3) * (s.b - 80), 5);
    }
    const a = inside[0]!;
    const b = inside[inside.length - 1]!;
    if (Math.abs(b.b - a.b) > TOL) {
      expect((b.Z - a.Z) / (b.b - a.b)).toBeCloseTo(4 / 3, 4);
    }
  });
});
