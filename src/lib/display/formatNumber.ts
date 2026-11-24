/** Display formatting for plan / dual / sensitivity numbers (does not alter stored values). */
const ZERO_EPS = 1e-9;

/**
 * Canonical LP / sensitivity display: always 2 decimal places (1.33, 4.67, 150.00).
 * ±Infinity → «∞» / «−∞»; non-finite → «—».
 */
export function formatPlanNumber(n: number): string {
  if (n === Number.POSITIVE_INFINITY) return '∞';
  if (n === Number.NEGATIVE_INFINITY) return '−∞';
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) < ZERO_EPS) return '0.00';
  return n.toFixed(2);
}

/** Same canon — kept for compare-page call sites. */
export const formatCompareNumber = formatPlanNumber;

/** Same canon — kept for sensitivity call sites. */
export const formatSensitivityNumber = formatPlanNumber;
