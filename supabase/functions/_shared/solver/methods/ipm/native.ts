/**
 * Primal-dual interior-point method for max cᵀx s.t. Ax ≤ b, x ≥ 0.
 * Mehrotra predictor-corrector style; duals from y (shadow prices).
 */
import type { Model } from '../../types.ts';
import { buildSolveResult } from '../../shared/resultBuild.ts';

const EPS = 1e-9;
const TOL = 1e-8;
const MAX_ITER = 80;

function zeros(n: number): number[] {
  return new Array(n).fill(0);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Solve dense symmetric positive-definite system via Cholesky. */
function cholSolve(H: number[][], rhs: number[]): number[] | null {
  const n = H.length;
  const L = zeros(n).map(() => zeros(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = H[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= EPS) return null;
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  const y = zeros(n);
  for (let i = 0; i < n; i++) {
    let s = rhs[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = zeros(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

export interface IpmSolveOk {
  ok: true;
  x: number[];
  y: number[];
  Z: number;
  feasible: boolean;
  iterations: number;
}

export interface IpmSolveFail {
  ok: false;
  reason: string;
}

export type IpmRaw = IpmSolveOk | IpmSolveFail;

/**
 * Solve max cᵀx s.t. Ax + s = b, x ≥ 0, s ≥ 0.
 * Dual: Aᵀy − z = c, y ≥ 0, z ≥ 0; complementarity Xz = μe, Sy = μe.
 */
export function solveIpmRaw(model: Model): IpmRaw {
  const m = model.resources.length;
  const n = model.products.length;
  if (m === 0 || n === 0) return { ok: false, reason: "empty" };

  const A = model.A;
  const b = model.b.slice();
  const c = model.c.slice();

  // Feasibility: b >= 0 required for nonnegative slack start
  for (let i = 0; i < m; i++) {
    if (b[i] < -EPS) return { ok: false, reason: "negative_rhs" };
  }

  // Starting point (Mehrotra-style heuristic)
  let x = zeros(n).map(() => 1);
  let s = zeros(m);
  for (let i = 0; i < m; i++) {
    let Ax = 0;
    for (let j = 0; j < n; j++) Ax += A[i][j] * x[j];
    s[i] = Math.max(1, b[i] - Ax + 1);
  }
  // Adjust x so Ax + s ≈ b with positive s
  for (let j = 0; j < n; j++) x[j] = 1;
  for (let i = 0; i < m; i++) {
    let Ax = 0;
    for (let j = 0; j < n; j++) Ax += A[i][j] * x[j];
    s[i] = Math.max(1, b[i] * 0.5 + 1);
    // Scale x down if needed
    if (Ax > b[i] * 0.5) {
      const scale = (b[i] * 0.25) / Math.max(Ax, EPS);
      for (let j = 0; j < n; j++) x[j] *= Math.min(1, scale);
    }
  }
  for (let i = 0; i < m; i++) {
    let Ax = 0;
    for (let j = 0; j < n; j++) Ax += A[i][j] * x[j];
    s[i] = Math.max(1, b[i] - Ax);
    if (s[i] < EPS) {
      s[i] = 1;
      // shrink x
      for (let j = 0; j < n; j++) x[j] *= 0.5;
    }
  }
  // Recompute s after shrinks
  for (let i = 0; i < m; i++) {
    let Ax = 0;
    for (let j = 0; j < n; j++) Ax += A[i][j] * x[j];
    s[i] = Math.max(1e-2, b[i] - Ax);
    if (b[i] - Ax < 1e-2) {
      const shrink = Math.max(0.1, (b[i] - 1e-2) / Math.max(Ax, EPS));
      for (let j = 0; j < n; j++) x[j] *= Math.min(1, shrink);
      Ax = 0;
      for (let j = 0; j < n; j++) Ax += A[i][j] * x[j];
      s[i] = Math.max(1e-2, b[i] - Ax);
    }
  }

  let y = zeros(m).map(() => 1);
  let z = zeros(n).map(() => 1);

  // Improve dual start: z = max(1, Aᵀy - c) wait for max: Aᵀy - z = c ⇒ z = Aᵀy - c
  for (let j = 0; j < n; j++) {
    let At_y = 0;
    for (let i = 0; i < m; i++) At_y += A[i][j] * y[i];
    z[j] = Math.max(1, At_y - c[j] + 1);
  }
  for (let i = 0; i < m; i++) y[i] = Math.max(1, y[i]);

  let iterations = 0;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    iterations = iter + 1;

    // Residuals
    const rp = zeros(m); // b - Ax - s
    for (let i = 0; i < m; i++) {
      let Ax = 0;
      for (let j = 0; j < n; j++) Ax += A[i][j] * x[j];
      rp[i] = b[i] - Ax - s[i];
    }
    const rd = zeros(n); // c - Aᵀy + z  (stationarity for max: Aᵀy - z = c)
    for (let j = 0; j < n; j++) {
      let At_y = 0;
      for (let i = 0; i < m; i++) At_y += A[i][j] * y[i];
      rd[j] = c[j] - At_y + z[j];
    }

    const mu = (dot(x, z) + dot(s, y)) / (n + m);
    const primInf = Math.sqrt(dot(rp, rp));
    const dualInf = Math.sqrt(dot(rd, rd));
    if (primInf < TOL && dualInf < TOL && mu < TOL) break;

    // Predictor (affine): solve Newton with rhs complementarity = -Xz, -Sy
    const dxAff = zeros(n);
    const dsAff = zeros(m);
    const dyAff = zeros(m);
    const dzAff = zeros(n);

    const solved = newtonStep(
      A,
      x,
      s,
      y,
      z,
      rp,
      rd,
      /* rxi */ x.map((xj, j) => -xj * z[j]),
      /* rsi */ s.map((si, i) => -si * y[i]),
      dxAff,
      dsAff,
      dyAff,
      dzAff,
    );
    if (!solved) return { ok: false, reason: "newton_fail" };

    // Step length affine
    const alphaPAff = maxStep(x, dxAff, s, dsAff);
    const alphaDAff = maxStep(y, dyAff, z, dzAff);

    let muAff = 0;
    for (let j = 0; j < n; j++) muAff += (x[j] + alphaPAff * dxAff[j]) * (z[j] + alphaDAff * dzAff[j]);
    for (let i = 0; i < m; i++) muAff += (s[i] + alphaPAff * dsAff[i]) * (y[i] + alphaDAff * dyAff[i]);
    muAff /= n + m;
    const sigma = Math.pow(muAff / Math.max(mu, EPS), 3);
    const muTarget = sigma * mu;

    // Corrector
    const rxi = zeros(n);
    const rsi = zeros(m);
    for (let j = 0; j < n; j++) rxi[j] = -x[j] * z[j] - dxAff[j] * dzAff[j] + muTarget;
    for (let i = 0; i < m; i++) rsi[i] = -s[i] * y[i] - dsAff[i] * dyAff[i] + muTarget;

    const dx = zeros(n);
    const ds = zeros(m);
    const dy = zeros(m);
    const dz = zeros(n);
    if (
      !newtonStep(A, x, s, y, z, rp, rd, rxi, rsi, dx, ds, dy, dz)
    ) {
      return { ok: false, reason: "newton_fail" };
    }

    const alphaP = 0.995 * maxStep(x, dx, s, ds);
    const alphaD = 0.995 * maxStep(y, dy, z, dz);

    for (let j = 0; j < n; j++) {
      x[j] += alphaP * dx[j];
      z[j] += alphaD * dz[j];
    }
    for (let i = 0; i < m; i++) {
      s[i] += alphaP * ds[i];
      y[i] += alphaD * dy[i];
    }
  }

  // Clean tiny values
  const xOut = x.map((v) => (v < 1e-8 ? 0 : v));
  const yOut = y.map((v) => (v < 1e-8 ? 0 : v));
  let Z = 0;
  for (let j = 0; j < n; j++) Z += c[j] * xOut[j];

  // Feasibility check
  let feasible = true;
  for (let i = 0; i < m; i++) {
    let usage = 0;
    for (let j = 0; j < n; j++) usage += A[i][j] * xOut[j];
    if (usage > b[i] + 1e-4) feasible = false;
  }

  return { ok: true, x: xOut, y: yOut, Z, feasible, iterations };
}

function maxStep(
  u: number[],
  du: number[],
  v: number[],
  dv: number[],
): number {
  let alpha = 1;
  for (let i = 0; i < u.length; i++) {
    if (du[i] < -EPS) alpha = Math.min(alpha, -u[i] / du[i]);
  }
  for (let i = 0; i < v.length; i++) {
    if (dv[i] < -EPS) alpha = Math.min(alpha, -v[i] / dv[i]);
  }
  return Math.max(0, Math.min(1, alpha));
}

/**
 * Newton step for KKT:
 *   A dx + ds = rp
 *   Aᵀ dy - dz = rd   (actually rd = c - Aᵀy + z, so Aᵀ dy - dz = rd)
 *   Z dx + X dz = rxi
 *   Y ds + S dy = rsi
 *
 * Eliminate: dz = X^{-1}(rxi - Z dx), ds = S^{-1}(rsi - Y? wait)
 * From Z dx + X dz = rxi ⇒ dz = X^{-1}(rxi - Z dx)
 * From Y ds + S dy = rsi ⇒ ds = Y^{-1}(rsi - S dy) — better: ds = S^{-1}(rsi - Y? no)
 *   s.*dy + y.*ds = rsi ⇒ ds = (rsi - s.*dy) ./ y
 *
 * A dx + ds = rp ⇒ A dx + (rsi - S dy)./Y = rp
 * Aᵀ dy - dz = rd ⇒ Aᵀ dy - (rxi - Z dx)./X = rd
 *
 * From dual: dz = X^{-1}(rxi - Z dx)
 * Aᵀ dy - X^{-1} rxi + X^{-1} Z dx = rd
 * X^{-1} Z dx + Aᵀ dy = rd + X^{-1} rxi
 *
 * From primal: ds = Y^{-1}(rsi - S dy)
 * A dx + Y^{-1} rsi - Y^{-1} S dy = rp
 * A dx - Y^{-1} S dy = rp - Y^{-1} rsi
 *
 * Normal equations in dy or dx. Use dx form:
 * Let D2 = X Z^{-1} wait...
 *
 * From second: dx = Z^{-1} X (Aᵀ dy - rd - X^{-1} rxi)? Let me re-derive carefully.
 */
function newtonStep(
  A: number[][],
  x: number[],
  s: number[],
  y: number[],
  z: number[],
  rp: number[],
  rd: number[],
  rxi: number[],
  rsi: number[],
  dx: number[],
  ds: number[],
  dy: number[],
  dz: number[],
): boolean {
  const m = s.length;
  const n = x.length;

  // Use augmented system reduced to dy (m×m) when m is small (Task 13: m=3)
  // dx_j = (x_j / z_j) * ( -rd_j? )
  // From: Z dx + X dz = rxi  and  Aᵀ dy - dz = rd
  //   dz = Aᵀ dy - rd
  //   Z dx + X (Aᵀ dy - rd) = rxi
  //   Z dx = rxi - X Aᵀ dy + X rd
  //   dx = Z^{-1}(rxi + X rd) - Z^{-1} X Aᵀ dy
  //
  // From: Y ds + S dy = rsi  and  A dx + ds = rp
  //   ds = rp - A dx
  //   Y (rp - A dx) + S dy = rsi
  //   -Y A dx + S dy = rsi - Y rp
  //   S dy = rsi - Y rp + Y A dx
  //   dy = S^{-1}(rsi - Y rp) + S^{-1} Y A dx
  //
  // Substitute dx into... actually substitute dx into primal residual form:
  // A dx + ds = rp, ds = Y^{-1}(rsi - S dy)
  // A dx + Y^{-1} rsi - Y^{-1} S dy = rp
  // A dx - (S/Y) dy = rp - Y^{-1} rsi
  //
  // dx = inv(Z)(rxi + X.*rd) - inv(Z)*X * Aᵀ dy
  // Let px = (rxi + x.*rd) ./ z
  //     Dx = x ./ z   (diagonal)
  // dx = px - Dx * (Aᵀ dy)
  //
  // A (px - Dx Aᵀ dy) - (s./y) dy = rp - rsi./y
  // A px - A Dx Aᵀ dy - Ds dy = rp - rsi./y
  // (A Dx Aᵀ + Ds) dy = A px - (rp - rsi./y)
  // Wait sign: A px - A Dx Aᵀ dy - Ds dy = rp - rsi./y
  // - (A Dx Aᵀ + Ds) dy = rp - rsi./y - A px
  // (A Dx Aᵀ + Ds) dy = A px - rp + rsi./y

  const px = zeros(n);
  const Dx = zeros(n);
  for (let j = 0; j < n; j++) {
    Dx[j] = x[j] / Math.max(z[j], EPS);
    px[j] = (rxi[j] + x[j] * rd[j]) / Math.max(z[j], EPS);
  }
  const Ds = zeros(m);
  const rhsY = zeros(m);
  for (let i = 0; i < m; i++) {
    Ds[i] = s[i] / Math.max(y[i], EPS);
    let Apx = 0;
    for (let j = 0; j < n; j++) Apx += A[i][j] * px[j];
    rhsY[i] = Apx - rp[i] + rsi[i] / Math.max(y[i], EPS);
  }

  // H = A Dx Aᵀ + Ds
  const H = zeros(m).map(() => zeros(m));
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < m; k++) {
      let sum = 0;
      for (let j = 0; j < n; j++) sum += A[i][j] * Dx[j] * A[k][j];
      H[i][k] = sum;
    }
    H[i][i] += Ds[i];
  }

  const dySol = cholSolve(H, rhsY);
  if (!dySol) return false;
  for (let i = 0; i < m; i++) dy[i] = dySol[i];

  for (let j = 0; j < n; j++) {
    let At_dy = 0;
    for (let i = 0; i < m; i++) At_dy += A[i][j] * dy[i];
    dx[j] = px[j] - Dx[j] * At_dy;
    dz[j] = At_dy - rd[j];
  }
  for (let i = 0; i < m; i++) {
    let Adx = 0;
    for (let j = 0; j < n; j++) Adx += A[i][j] * dx[j];
    ds[i] = rp[i] - Adx;
  }
  return true;
}

export function solveIpmModel(model: Model) {
  const raw = solveIpmRaw(model);
  if (!raw.ok) return null;
  return buildSolveResult(model, raw.x, raw.y, raw.feasible);
}
