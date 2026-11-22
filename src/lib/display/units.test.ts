import { describe, expect, it } from 'vitest';
import { createTask13Model } from '$lib/domain';
import {
  coeffUnit,
  joinUnit,
  labeledName,
  labeledProduct,
  labeledResource,
  objectiveUnit,
  priceUnit,
  shadowUnit,
  trimUnit,
} from './units';

describe('display/units', () => {
  it('trims and joins only complete pairs', () => {
    expect(trimUnit('  кг ')).toBe('кг');
    expect(trimUnit('  ')).toBe('');
    expect(joinUnit('кг', 'шт')).toBe('кг/шт');
    expect(joinUnit('кг', '')).toBe('');
    expect(joinUnit('', 'шт')).toBe('');
  });

  it('builds labeled names with parentheses', () => {
    expect(labeledName('Труд', 'чел./дней')).toBe('Труд (чел./дней)');
    expect(labeledName('Труд', '')).toBe('Труд');
    expect(labeledName('Труд', '  ')).toBe('Труд');
  });

  it('derives Task 13 units from the model', () => {
    const model = createTask13Model();
    expect(objectiveUnit(model)).toBe('у.е.');
    expect(labeledProduct(model, 0)).toBe('Осциллограф (шт)');
    expect(labeledResource(model, 0)).toBe('Труд (чел./дней)');
    expect(priceUnit(model, 0)).toBe('у.е./шт');
    expect(shadowUnit(model, 1)).toBe('у.е./кг');
    expect(coeffUnit(model, 1, 0)).toBe('кг/шт');
  });

  it('returns empty derived units when objective is missing', () => {
    const model = createTask13Model();
    delete model.objective_unit;
    expect(priceUnit(model, 0)).toBe('');
    expect(shadowUnit(model, 0)).toBe('');
    expect(coeffUnit(model, 0, 0)).toBe('чел./дней/шт');
  });
});
