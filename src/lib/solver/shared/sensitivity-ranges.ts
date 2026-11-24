/**
 * Basis stability ranges from the optimal primal simplex tableau (B⁻¹).
 * Standard form: max cᵀx s.t. Ax ≤ b, x ≥ 0.
 */
import type { Model } from '$lib/domain';
import { solvePrimalWithTrace } from '../methods/lp/simplex';

const EPS = 1e-9;

export type FiniteOrInf = number; // ±Infinity allowed

export type RhsRangeRow = {
  resource: string;
  index: number;
  current: number;
  allowIncrease: FiniteOrInf;
  allowDecrease: FiniteOrInf;
  lower: FiniteOrInf;
  upper: FiniteOrInf;
  shadowPrice: number;
};

export type ObjRangeRow = {
  product: string;
  index: number;
  current: number;
  allowIncrease: FiniteOrInf;
  allowDecrease: FiniteOrInf;
  lower: FiniteOrInf;
  upper: FiniteOrInf;
  /** c̄_j = c_j − πᵀa_j; 0 for basic variables. */
  reducedCost: number;
  basic: boolean;
};

export type SensitivityRanges = {
  rhs: RhsRangeRow[];
  objective: ObjRangeRow[];
  /** Basic column labels from the final tableau (e.g. x:…, s0). */
  basisLabels: string[];
  Z: number;
};

function clampZero(v: number): number {
  return Math.abs(v) < EPS ? 0 : v;
}

/** Δ bounds from x_B + Δ·θ ≥ 0. */
function deltaBoundsFromColumn(
  xB: number[],
  theta: number[],
): { lo: FiniteOrInf; hi: FiniteOrInf } {
  let lo = Number.NEGATIVE_INFINITY;
  let hi = Number.POSITIVE_INFINITY;
  for (let k = 0; k < xB.length; k++) {
    const t = theta[k]!;
    if (Math.abs(t) < EPS) continue;
    const bound = -xB[k]! / t;
    if (t > 0) lo = Math.max(lo, bound);
    else hi = Math.min(hi, bound);
  }
  return { lo, hi };
}

/**
 * Extract B⁻¹ and sensitivity ranges from the optimal native simplex tableau.
 * Returns null when the LP is infeasible / unbounded / missing a final matrix.
 */
export function computeSensitivityRanges(model: Model): SensitivityRanges | null {
  const outcome = solvePrimalWithTrace(model);
  if (!outcome.ok) return null;

  const last = [...outcome.frames].reverse().find((f) => f.matrix && f.phase === 2);
  if (!last?.matrix || !last.basis || !last.colLabels) return null;

  const m = model.resources.length;
  const n = model.products.length;
  const ncols = n + m;
  const T = last.matrix;
  const basisLabels = last.basis;
  const colLabels = last.colLabels;
  if (T.length < m + 1 || (T[0]?.length ?? 0) < ncols + 1) return null;

  // Slack columns of the final body = B⁻¹ (initial basis = identity slacks).
  const Binv: number[][] = Array.from({ length: m }, (_, i) =>
    Array.from({ length: m }, (_, k) => clampZero(T[i]![n + k]!)),
  );
  const xB = Array.from({ length: m }, (_, i) => Math.max(0, clampZero(T[i]![ncols]!)));

  // Shadow prices from obj row on slack columns (z_j − c_j with c_slack = 0 ⇒ y).
  const shadow = Array.from({ length: m }, (_, i) => Math.max(0, clampZero(T[m]![n + i]!)));

  const rhs: RhsRangeRow[] = model.resources.map((resource, i) => {
    const theta = Array.from({ length: m }, (_, k) => Binv[k]![i]!);
    const { lo, hi } = deltaBoundsFromColumn(xB, theta);
    const current = model.b[i]!;
    const allowIncrease = Number.isFinite(hi) ? hi : Number.POSITIVE_INFINITY;
    const allowDecrease = Number.isFinite(lo) ? -lo : Number.POSITIVE_INFINITY;
    return {
      resource,
      index: i,
      current,
      allowIncrease,
      allowDecrease,
      lower: Number.isFinite(lo) ? current + lo : Number.NEGATIVE_INFINITY,
      upper: Number.isFinite(hi) ? current + hi : Number.POSITIVE_INFINITY,
      shadowPrice: shadow[i]!,
    };
  });

  // Basis membership for decision variables.
  const basisCols = new Set<number>();
  for (const label of basisLabels) {
    const idx = colLabels.indexOf(label);
    if (idx >= 0 && idx < n) basisCols.add(idx);
  }

  // Reduced costs ĉ_j = c_j − π a_j = −(z_j − c_j) = −T[m][j]
  const reduced = Array.from({ length: n }, (_, j) => clampZero(-(T[m]![j] ?? 0)));

  // Nonbasic column indices among decision + slack (for basic c_j ranges).
  const nonbasicCols: number[] = [];
  for (let j = 0; j < ncols; j++) {
    if (!basisLabels.includes(colLabels[j]!)) nonbasicCols.push(j);
  }

  /** π_row for nonbasic col j: (B⁻¹ Ã_j)[row] — body of final tableau. */
  const tableauCol = (j: number): number[] =>
    Array.from({ length: m }, (_, i) => clampZero(T[i]![j]!));

  const objective: ObjRangeRow[] = model.products.map((product, j) => {
    const current = model.c[j]!;
    const basic = basisCols.has(j);
    const reducedCost = basic ? 0 : reduced[j]!;

    if (!basic) {
      // ĉ_j + Δ ≤ 0 ⇒ Δ ≤ −ĉ_j (max form; ĉ_j ≤ 0 at optimum)
      const allowIncrease =
        reducedCost < -EPS ? -reducedCost : reducedCost > EPS ? 0 : Number.POSITIVE_INFINITY;
      return {
        product,
        index: j,
        current,
        allowIncrease,
        allowDecrease: Number.POSITIVE_INFINITY,
        lower: Number.NEGATIVE_INFINITY,
        upper: Number.isFinite(allowIncrease) ? current + allowIncrease : Number.POSITIVE_INFINITY,
        reducedCost,
        basic: false,
      };
    }

    // Basic: find which basis row holds product j
    let basisRow = -1;
    for (let i = 0; i < m; i++) {
      if (basisLabels[i] === colLabels[j]) {
        basisRow = i;
        break;
      }
    }
    if (basisRow < 0) {
      return {
        product,
        index: j,
        current,
        allowIncrease: Number.POSITIVE_INFINITY,
        allowDecrease: Number.POSITIVE_INFINITY,
        lower: Number.NEGATIVE_INFINITY,
        upper: Number.POSITIVE_INFINITY,
        reducedCost: 0,
        basic: true,
      };
    }

    // For nonbasic k: ĉ_k' = ĉ_k − Δ · (B⁻¹ Ã_k)[basisRow]; need ĉ_k' ≤ 0
    // Tableau stores z−c = −ĉ, so use rc = −T[m][k]
    let lo = Number.NEGATIVE_INFINITY;
    let hi = Number.POSITIVE_INFINITY;
    for (const k of nonbasicCols) {
      const pi = tableauCol(k)[basisRow]!;
      if (Math.abs(pi) < EPS) continue;
      const rc = clampZero(-(T[m]![k] ?? 0));
      // rc − Δ·pi ≤ 0
      if (pi > 0) lo = Math.max(lo, rc / pi);
      else hi = Math.min(hi, rc / pi);
    }

    const allowIncrease = Number.isFinite(hi) ? hi : Number.POSITIVE_INFINITY;
    const allowDecrease = Number.isFinite(lo) ? -lo : Number.POSITIVE_INFINITY;
    return {
      product,
      index: j,
      current,
      allowIncrease,
      allowDecrease,
      lower: Number.isFinite(lo) ? current + lo : Number.NEGATIVE_INFINITY,
      upper: Number.isFinite(hi) ? current + hi : Number.POSITIVE_INFINITY,
      reducedCost: 0,
      basic: true,
    };
  });

  return {
    rhs,
    objective,
    basisLabels: [...basisLabels],
    Z: clampZero(outcome.Z),
  };
}

/**
 * Parametric Z(b_i) samples. Inside the stability interval Z is linear
 * with slope = shadow price; outside we re-solve the primal.
 */
export function sampleZVsResource(
  model: Model,
  resourceIndex: number,
  opts?: { points?: number; padRatio?: number },
): { b: number; Z: number; insideInterval: boolean }[] {
  const ranges = computeSensitivityRanges(model);
  if (!ranges) return [];
  const row = ranges.rhs[resourceIndex];
  if (!row) return [];

  const points = opts?.points ?? 41;
  const pad = opts?.padRatio ?? 0.25;
  const b0 = row.current;
  const lo = Number.isFinite(row.lower) ? row.lower : Math.max(0, b0 * 0.25);
  const hi = Number.isFinite(row.upper) ? row.upper : b0 * 2;
  const span = Math.max(hi - lo, Math.abs(b0) * 0.5, 1);
  const from = Math.max(0, lo - pad * span);
  const to = hi + pad * span;

  const out: { b: number; Z: number; insideInterval: boolean }[] = [];
  for (let p = 0; p < points; p++) {
    const b = from + ((to - from) * p) / Math.max(1, points - 1);
    const inside =
      b + EPS >= (Number.isFinite(row.lower) ? row.lower : Number.NEGATIVE_INFINITY) &&
      b - EPS <= (Number.isFinite(row.upper) ? row.upper : Number.POSITIVE_INFINITY);

    let Z: number;
    if (inside) {
      Z = ranges.Z + row.shadowPrice * (b - b0);
    } else {
      const trial: Model = {
        ...model,
        b: model.b.map((v, i) => (i === resourceIndex ? b : v)),
      };
      const solved = solvePrimalWithTrace(trial);
      Z = solved.ok ? solved.Z : Number.NaN;
    }
    out.push({ b, Z, insideInterval: inside });
  }
  return out;
}
