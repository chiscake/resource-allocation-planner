import { describe, expect, it } from 'vitest';
import { createTask13Model, type WhatIfRowData } from '$lib/domain';
import { niceDeltaZScale, shortDeltaZLabel } from './delta-z-chart';

function row(
  partial: Partial<WhatIfRowData> & Pick<WhatIfRowData, 'title' | 'mutation'>,
): WhatIfRowData {
  return {
    Z: 0,
    baseZ: 0,
    deltaZ: 0,
    mutatedModel: createTask13Model(),
    before: '',
    after: '',
    plan: {},
    shadowMetric: null,
    shadowKind: 'none',
    basisChanged: false,
    criticalResources: [],
    ...partial,
  };
}

describe('shortDeltaZLabel', () => {
  it('builds compact labels for pack scenarios', () => {
    expect(
      shortDeltaZLabel(
        row({
          title: 'Запас: Труд (чел./дней) +10%',
          mutation: { kind: 'resource_change', target: 'Труд', delta: 0.1 },
        }),
      ),
    ).toBe('Труд +10%');

    expect(
      shortDeltaZLabel(
        row({
          title: 'Запас: Сырье (кг) −10%',
          mutation: { kind: 'resource_change', target: 'Сырье', delta: -0.1 },
        }),
      ),
    ).toBe('Сырье −10%');

    expect(
      shortDeltaZLabel(
        row({
          title: 'Расход: Частотомер (шт) −10%',
          mutation: { kind: 'modernization', target: 'Частотомер', delta: -0.1 },
        }),
      ),
    ).toBe('Норма: Частотомер');

    expect(
      shortDeltaZLabel(
        row({
          title: 'Цена: Генератор (шт) +15%',
          mutation: { kind: 'price_change', target: 'Генератор', delta: 0.15 },
        }),
      ),
    ).toBe('Цена: Генератор +15%');
  });
});

describe('niceDeltaZScale', () => {
  it('covers ±18 with round ticks like −20…20 step 10', () => {
    const s = niceDeltaZScale(-18, 18);
    expect(s.min).toBeLessThanOrEqual(-18);
    expect(s.max).toBeGreaterThanOrEqual(18);
    expect(s.min).toBeGreaterThanOrEqual(-30);
    expect(s.max).toBeLessThanOrEqual(30);
    expect(s.ticks).toContain(0);
    expect(s.ticks[0]).toBe(s.min);
    expect(s.ticks.at(-1)).toBe(s.max);
    const step = s.ticks[1]! - s.ticks[0]!;
    expect(step).toBe(10);
    expect(s.ticks).toEqual([-20, -10, 0, 10, 20]);
  });

  it('does not clip a positive max when negatives dominate the raw span pad', () => {
    const s = niceDeltaZScale(-18, 18.5);
    expect(s.max).toBeGreaterThanOrEqual(18.5);
    expect(s.min).toBeLessThanOrEqual(-18);
    expect(s.max - s.min).toBeLessThanOrEqual(60);
  });
});
