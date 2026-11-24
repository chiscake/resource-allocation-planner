import { describe, expect, it } from 'vitest';
import {
  formatCompareNumber,
  formatPlanNumber,
  formatSensitivityNumber,
} from './format-plan-number';

describe('format-plan-number re-export', () => {
  it('matches display canon (2 decimals, not 2 significant digits)', () => {
    expect(formatPlanNumber(4 / 3)).toBe('1.33');
    expect(formatPlanNumber(31.333)).toBe('31.33');
    expect(formatCompareNumber(10.6667)).toBe('10.67');
    expect(formatSensitivityNumber(Number.POSITIVE_INFINITY)).toBe('∞');
  });
});
