/** Display formatting for plan / dual numbers (does not change Math.round of values). */
const INT_EPS = 1e-9;

/**
 * Integers without trailing zeros; non-integers with ~1–2 significant digits.
 * Display-only — does not alter stored / rounded plan values.
 */
export function formatPlanNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) < INT_EPS) return '0';
  const nearest = Math.round(n);
  if (Math.abs(n - nearest) < INT_EPS) return String(nearest);
  // Prefer 2 significant digits; fall back to trimmed decimals if scientific.
  const prec = n.toPrecision(2);
  if (/e/i.test(prec)) {
    return parseFloat(n.toFixed(2)).toString();
  }
  return parseFloat(prec).toString();
}
