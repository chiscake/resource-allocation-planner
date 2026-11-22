/**
 * Gradient descent on a diagonal linear network (Wang, Ghosal, Mazumder, arXiv:2310.02535, Algorithm 1):
 * x = u∘u, f(u) = ½‖Âx − b̂‖², u ← u∘(1 − 2η Âᵀ(Âx − b̂)), u⁰ᵢ = α·exp(−ĉᵢ/(2λ)).
 *
 * Edge mirror of src/lib/solver/methods/dln/native.ts.
 */
import type { DlnRunConfig, DlnStopReason, Model, SolveResult } from '../../types.ts';
import { buildSolveResult } from '../../shared/resultBuild.ts';
import { solveLocalLpDuals } from '../../shared/lpDuals.ts';

export interface DlnHyperparameters {
  lambda: number;
  kappa: number;
  tol: number;
  rowScale: boolean;
  maxIter: number;
}

export const DEFAULT_DLN_HYPERPARAMS: DlnHyperparameters = {
  lambda: 0.005,
  kappa: 3,
  tol: 1e-8,
  rowScale: true,
  maxIter: 100_000,
};

const BOUND_SLACK = 0.1;
const POWER_ITERATIONS = 50;
const PRIMAL_FEAS_TOL = 1e-4;

export interface DlnStandardForm {
  rows: number;
  cols: number;
  a: Float64Array;
  b: Float64Array;
  c: Float64Array;
}

export interface DlnSolveOk {
  ok: true;
  x: number[];
  z: number[];
  Z: number;
  feasible: boolean;
  iterations: number;
  residual: number;
  stopReason: DlnStopReason;
}

export interface DlnSolveFail {
  ok: false;
  reason: string;
}

export type DlnRaw = DlnSolveOk | DlnSolveFail;

export interface DlnSolveMeta {
  config: DlnRunConfig;
  stopReason: DlnStopReason;
  iterations: number;
  residual: number;
  feasible: boolean;
}

function norm2(v: Float64Array, offset = 0, len = v.length): number {
  let s = 0;
  const end = offset + len;
  for (let i = offset; i < end; i++) {
    const x = v[i];
    s += x * x;
  }
  return Math.sqrt(s);
}

function normInf(v: Float64Array): number {
  let m = 0;
  for (let i = 0; i < v.length; i++) {
    const a = Math.abs(v[i]);
    if (a > m) m = a;
  }
  return m;
}

function scaleSlice(alpha: number, v: Float64Array, offset = 0, len = v.length): void {
  const end = offset + len;
  for (let i = offset; i < end; i++) {
    v[i] *= alpha;
  }
}

function matVec(
  a: Float64Array,
  rows: number,
  cols: number,
  x: Float64Array,
  y: Float64Array,
): void {
  for (let i = 0; i < rows; i++) {
    const rowOff = i * cols;
    let s = 0;
    for (let j = 0; j < cols; j++) {
      s += a[rowOff + j] * x[j];
    }
    y[i] = s;
  }
}

function matTVec(
  a: Float64Array,
  rows: number,
  cols: number,
  x: Float64Array,
  y: Float64Array,
): void {
  y.fill(0);
  for (let i = 0; i < rows; i++) {
    const xi = x[i];
    if (xi === 0) continue;
    const rowOff = i * cols;
    for (let j = 0; j < cols; j++) {
      y[j] += a[rowOff + j] * xi;
    }
  }
}

export function buildStandardForm(model: Model): DlnStandardForm {
  const m = model.resources.length;
  const n = model.products.length;
  const cols = n + m;
  const a = new Float64Array(m * cols);
  const b = new Float64Array(m);
  const c = new Float64Array(cols);

  for (let i = 0; i < m; i++) {
    const rowOff = i * cols;
    const row = model.A[i];
    for (let j = 0; j < n; j++) {
      a[rowOff + j] = row[j] ?? 0;
    }
    a[rowOff + n + i] = 1.0;
    b[i] = model.b[i] ?? 0;
  }
  for (let j = 0; j < n; j++) {
    c[j] = -(model.c[j] ?? 0);
  }
  return { rows: m, cols, a, b, c };
}

export function validateStandardFormForDln(sf: DlnStandardForm): string | null {
  const { rows, cols, a, b } = sf;
  if (rows === 0 || cols === 0) return 'dln_unsupported';
  for (let i = 0; i < rows; i++) {
    if (!(b[i] > 0) || !Number.isFinite(b[i])) {
      return 'dln_unsupported_rhs';
    }
  }
  for (let j = 0; j < cols; j++) {
    let positive = false;
    for (let i = 0; i < rows; i++) {
      const v = a[i * cols + j];
      if (!Number.isFinite(v) || v < 0) {
        return 'dln_unsupported_negative_a';
      }
      if (v > 0) positive = true;
    }
    if (!positive) return 'dln_unsupported_unbounded_col';
  }
  return null;
}

export function sumBound(sf: DlnStandardForm): number {
  const { rows: m, cols: n, a, b } = sf;
  let perVariable = 0;
  let minColumnSum = Number.POSITIVE_INFINITY;
  for (let j = 0; j < n; j++) {
    let bound = Number.POSITIVE_INFINITY;
    let colSum = 0;
    for (let i = 0; i < m; i++) {
      const aij = a[i * n + j];
      colSum += aij;
      if (aij > 0) bound = Math.min(bound, b[i] / aij);
    }
    perVariable += bound;
    minColumnSum = Math.min(minColumnSum, colSum);
  }
  let sumB = 0;
  for (let i = 0; i < m; i++) sumB += b[i];
  const dual = Math.max(1.0, 1.0 / minColumnSum) * sumB;
  return Math.min(perVariable, dual);
}

function spectralNormSquared(
  a: Float64Array,
  rows: number,
  cols: number,
  iterations: number,
): number {
  const v = new Float64Array(cols);
  const av = new Float64Array(rows);
  v.fill(1.0 / Math.sqrt(cols));
  let estimate = 0;
  for (let k = 0; k < iterations; k++) {
    matVec(a, rows, cols, v, av);
    matTVec(a, rows, cols, av, v);
    estimate = norm2(v);
    if (estimate === 0) return 1.0;
    scaleSlice(1.0 / estimate, v);
  }
  return estimate;
}

export function solveDlnRaw(
  model: Model,
  hyper: DlnHyperparameters = DEFAULT_DLN_HYPERPARAMS,
): DlnRaw {
  const m = model.resources.length;
  const n = model.products.length;
  if (m === 0 || n === 0) return { ok: false, reason: 'dln_unsupported' };

  const sf = buildStandardForm(model);
  const why = validateStandardFormForDln(sf);
  if (why) return { ok: false, reason: why };

  const lambda =
    hyper.lambda > 0 && Number.isFinite(hyper.lambda)
      ? hyper.lambda
      : DEFAULT_DLN_HYPERPARAMS.lambda;
  const kappa =
    hyper.kappa > 0 && Number.isFinite(hyper.kappa) ? hyper.kappa : DEFAULT_DLN_HYPERPARAMS.kappa;
  const tol = hyper.tol > 0 && Number.isFinite(hyper.tol) ? hyper.tol : DEFAULT_DLN_HYPERPARAMS.tol;
  const rowScale = Boolean(hyper.rowScale);
  const maxIter = Math.max(1, Math.trunc(hyper.maxIter || DEFAULT_DLN_HYPERPARAMS.maxIter));

  const sfRows = sf.rows;
  const sfCols = sf.cols;
  const rows = sfRows + 1;
  const cols = sfCols + 1;

  const bigM = (1 + BOUND_SLACK) * sumBound(sf);
  if (!(bigM > 0) || !Number.isFinite(bigM)) {
    return { ok: false, reason: 'dln_numerical_failure' };
  }

  const a = new Float64Array(rows * cols);
  const b = new Float64Array(rows);
  for (let i = 0; i < sfRows; i++) {
    const srcOff = i * sfCols;
    const dstOff = i * cols;
    for (let j = 0; j < sfCols; j++) {
      a[dstOff + j] = sf.a[srcOff + j];
    }
    b[i] = sf.b[i] / bigM;
  }
  const lastRowOff = sfRows * cols;
  for (let j = 0; j < cols; j++) {
    a[lastRowOff + j] = 1.0;
  }
  b[sfRows] = 1.0;

  if (rowScale) {
    for (let i = 0; i < rows; i++) {
      const rowOff = i * cols;
      const rn = norm2(a, rowOff, cols);
      if (rn > 0) {
        const inv = 1.0 / rn;
        scaleSlice(inv, a, rowOff, cols);
        b[i] *= inv;
      }
    }
  }

  let cMin = 0;
  let cMax = 0;
  for (let j = 0; j < sfCols; j++) {
    const v = sf.c[j];
    if (v < cMin) cMin = v;
    if (v > cMax) cMax = v;
  }
  let range = cMax - cMin;
  if (range <= 0) range = 1;
  const alphaMax = Math.min(0.49, 1.0 / Math.sqrt(cols));
  const logAlphaMax = Math.log(alphaMax);

  const u = new Float64Array(cols);
  for (let j = 0; j < cols; j++) {
    const rawC = j < sfCols ? sf.c[j] : 0.0;
    const cost = (rawC - cMin) / range;
    const w0 = logAlphaMax - cost / (2 * lambda);
    u[j] = Math.exp(w0);
  }

  const lipschitz = 1.02 * spectralNormSquared(a, rows, cols, POWER_ITERATIONS);
  const normB = norm2(b);
  if (!(normB > 0) || !Number.isFinite(normB)) {
    return { ok: false, reason: 'dln_numerical_failure' };
  }

  const x = new Float64Array(cols);
  const r = new Float64Array(rows);
  const g = new Float64Array(cols);

  let iter = 0;
  let residual = Number.NaN;
  let stopReason: DlnStopReason = 'max_iter';

  while (true) {
    for (let j = 0; j < cols; j++) {
      const uj = u[j];
      x[j] = uj * uj;
    }

    matVec(a, rows, cols, x, r);
    for (let i = 0; i < rows; i++) {
      r[i] -= b[i];
    }
    residual = norm2(r) / normB;
    if (!Number.isFinite(residual)) {
      return { ok: false, reason: 'dln_numerical_failure' };
    }
    if (residual <= tol) {
      stopReason = 'tol';
      break;
    }
    if (iter >= maxIter) {
      stopReason = 'max_iter';
      break;
    }

    matTVec(a, rows, cols, r, g);
    const gInf = normInf(g);
    const uInf = normInf(u);
    const eta = Math.min(1.0 / (4 * gInf), kappa / (5 * lipschitz * uInf * uInf));
    if (!(eta > 0) || !Number.isFinite(eta)) {
      return { ok: false, reason: 'dln_numerical_failure' };
    }

    for (let j = 0; j < cols; j++) {
      u[j] *= 1 - 2 * eta * g[j];
    }
    iter++;
  }

  const z: number[] = new Array(sfCols);
  for (let j = 0; j < sfCols; j++) {
    z[j] = bigM * x[j];
  }
  const xProd: number[] = new Array(n);
  let Z = 0;
  for (let j = 0; j < n; j++) {
    const v = Math.max(0, z[j]);
    xProd[j] = v;
    Z += model.c[j] * v;
  }

  let feasible = true;
  for (let i = 0; i < m; i++) {
    let usage = 0;
    for (let j = 0; j < n; j++) {
      usage += model.A[i][j] * xProd[j];
    }
    const tolRow = PRIMAL_FEAS_TOL * Math.max(1, Math.abs(model.b[i]));
    if (usage - model.b[i] > tolRow) {
      feasible = false;
      break;
    }
  }

  return {
    ok: true,
    x: xProd,
    z,
    Z,
    feasible,
    iterations: iter,
    residual,
    stopReason,
  };
}

export function solveDlnModel(
  model: Model,
  hyper: DlnHyperparameters = DEFAULT_DLN_HYPERPARAMS,
  preset: DlnRunConfig['preset'] = 'precise',
):
  | {
      ok: true;
      result: SolveResult;
      dln_meta: DlnSolveMeta;
    }
  | DlnSolveFail {
  const raw = solveDlnRaw(model, hyper);
  if (!raw.ok) return raw;

  const y = solveLocalLpDuals(model);
  const result = buildSolveResult(model, raw.x, y, raw.feasible);
  const config: DlnRunConfig = {
    lambda: hyper.lambda,
    kappa: hyper.kappa,
    tol: hyper.tol,
    rowScale: hyper.rowScale,
    maxIter: hyper.maxIter,
    preset,
  };
  return {
    ok: true,
    result,
    dln_meta: {
      config,
      stopReason: raw.stopReason,
      iterations: raw.iterations,
      residual: raw.residual,
      feasible: raw.feasible,
    },
  };
}
