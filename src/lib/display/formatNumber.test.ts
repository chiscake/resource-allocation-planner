import { describe, expect, it } from 'vitest';
import { formatCompareNumber, formatPlanNumber, formatSensitivityNumber } from './formatNumber';

describe('formatPlanNumber', () => {
  it('uses 2 decimal places (not 2 significant digits)', () => {
    expect(formatPlanNumber(1.333333)).toBe('1.33');
    expect(formatPlanNumber(4 / 3)).toBe('1.33');
    expect(formatPlanNumber(31.333)).toBe('31.33');
    expect(formatPlanNumber(4.6667)).toBe('4.67');
    expect(formatPlanNumber(10.6667)).toBe('10.67');
    expect(formatPlanNumber(150)).toBe('150.00');
    expect(formatPlanNumber(0)).toBe('0.00');
    expect(formatPlanNumber(-0)).toBe('0.00');
  });

  it('formats signed values callers can prefix', () => {
    expect(formatPlanNumber(-10.6667)).toBe('-10.67');
    expect(formatPlanNumber(10.6667)).toBe('10.67');
  });

  it('renders infinity and non-finite placeholders', () => {
    expect(formatPlanNumber(Number.POSITIVE_INFINITY)).toBe('∞');
    expect(formatPlanNumber(Number.NEGATIVE_INFINITY)).toBe('−∞');
    expect(formatPlanNumber(Number.NaN)).toBe('—');
  });

  it('keeps compare / sensitivity aliases in sync', () => {
    expect(formatCompareNumber(4 / 3)).toBe(formatPlanNumber(4 / 3));
    expect(formatSensitivityNumber(Number.POSITIVE_INFINITY)).toBe('∞');
    expect(formatSensitivityNumber(1.333)).toBe('1.33');
  });
});
