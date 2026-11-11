/**
 * Two-phase simplex for max cᵀx s.t. Ax ≤ b, x ≥ 0.
 * Full tableaux + Bland's rule; optional dual via max (−b)ᵀy s.t. (−Aᵀ)y ≤ (−c).
 */
import type { Model, SimplexTraceFrame, SolveResult } from "$lib/domain";
import { buildSolveResult } from "../../shared/resultBuild";

const EPS = 1e-9;
const MAX_FRAMES = 80;
const MAX_PIVOTS = 10_000;

export type SimplexOutcome =
  | {
      ok: true;
      x: number[];
      Z: number;
      frames: SimplexTraceFrame[];
    }
  | {
      ok: false;
      reason: "infeasible" | "unbounded" | "iteration_limit";
      frames: SimplexTraceFrame[];
    };

type Tableau = {
  /** (m+1) × (ncols+1); last column RHS; last row objective (max). */
  T: number[][];
  m: number;
  nDecision: number;
  ncols: number;
  basis: number[];
  colLabels: string[];
  artCols: Set<number>;
  frames: SimplexTraceFrame[];
  problem: "primal" | "dual";
  phase: 1 | 2;
};

function cloneMatrix(T: number[][]): number[][] {
  return T.map((row) => row.slice());
}

function roundEps(v: number): number {
  return Math.abs(v) < EPS ? 0 : v;
}

function captureFrame(
  tab: Tableau,
  note: string,
  entering?: string,
  leaving?: string,
): void {
  if (tab.frames.length >= MAX_FRAMES) return;
  const { T, m, ncols, basis, colLabels, problem, phase, nDecision } = tab;
  const Z = roundEps(T[m][ncols]);
  const reducedCosts = T[m].slice(0, ncols).map(roundEps);
  const x = new Array(nDecision).fill(0);
  for (let i = 0; i < m; i++) {
    const bi = basis[i];
    if (bi < nDecision) x[bi] = roundEps(T[i][ncols]);
  }
  tab.frames.push({
    matrix: cloneMatrix(T).map((row) => row.map(roundEps)),
    reducedCosts,
    basis: basis.map((bi) => colLabels[bi] ?? `v${bi}`),
    note,
    phase,
    Z,
    colLabels: colLabels.slice(),
    rowLabels: [
      ...basis.map((bi) => colLabels[bi] ?? `v${bi}`),
      "Z",
    ],
    entering,
    leaving,
    problem,
    x,
  });
}

/** Bland: smallest eligible index with negative reduced cost (max form). */
function pickEntering(
  T: number[][],
  m: number,
  ncols: number,
  forbidden?: Set<number>,
): number {
  let enter = -1;
  for (let j = 0; j < ncols; j++) {
    if (forbidden?.has(j)) continue;
    if (T[m][j] < -EPS) {
      enter = j;
      break;
    }
  }
  return enter;
}

/**
 * Bland leaving: among min-ratio ties, smallest basic variable index.
 * Returns row index or -1 if unbounded.
 */
function pickLeaving(
  T: number[][],
  m: number,
  ncols: number,
  enter: number,
  basis: number[],
): number {
  let bestRow = -1;
  let bestRatio = Number.POSITIVE_INFINITY;
  let bestBasisIdx = Number.POSITIVE_INFINITY;
  for (let i = 0; i < m; i++) {
    const a = T[i][enter];
    if (a <= EPS) continue;
    const ratio = T[i][ncols] / a;
    if (ratio < -EPS) continue;
    const bIdx = basis[i];
    if (
      ratio < bestRatio - EPS ||
      (Math.abs(ratio - bestRatio) <= EPS && bIdx < bestBasisIdx)
    ) {
      bestRatio = ratio;
      bestRow = i;
      bestBasisIdx = bIdx;
    }
  }
  return bestRow;
}

function pivot(tab: Tableau, leaveRow: number, enterCol: number): void {
  const { T, m, ncols } = tab;
  const piv = T[leaveRow][enterCol];
  for (let j = 0; j <= ncols; j++) T[leaveRow][j] /= piv;
  for (let i = 0; i <= m; i++) {
    if (i === leaveRow) continue;
    const factor = T[i][enterCol];
    if (Math.abs(factor) < EPS) {
      T[i][enterCol] = 0;
      continue;
    }
    for (let j = 0; j <= ncols; j++) {
      T[i][j] -= factor * T[leaveRow][j];
    }
  }
  tab.basis[leaveRow] = enterCol;
}

function runPhase(
  tab: Tableau,
  phaseNote: string,
  forbidEnter?: Set<number>,
): "optimal" | "unbounded" | "iteration_limit" {
  const { T, m, ncols, colLabels } = tab;
  captureFrame(tab, `${phaseNote}: initial tableau`);

  for (let iter = 0; iter < MAX_PIVOTS; iter++) {
    const enter = pickEntering(T, m, ncols, forbidEnter);
    if (enter < 0) return "optimal";

    const leave = pickLeaving(T, m, ncols, enter, tab.basis);
    if (leave < 0) return "unbounded";

    const enterLabel = colLabels[enter] ?? `c${enter}`;
    const leaveLabel = colLabels[tab.basis[leave]] ?? `r${leave}`;
    pivot(tab, leave, enter);
    captureFrame(
      tab,
      `${phaseNote}: pivot ${enterLabel} enters, ${leaveLabel} leaves`,
      enterLabel,
      leaveLabel,
    );
  }
  return "iteration_limit";
}

/**
 * Build tableau for max cᵀx s.t. Ax ≤ b, x ≥ 0.
 * Negative b rows get artificials (two-phase).
 */
function buildTableau(
  A: number[][],
  b: number[],
  c: number[],
  varLabels: string[],
  problem: "primal" | "dual",
): Tableau {
  const m = A.length;
  const n = c.length;
  const needArt: boolean[] = b.map((bi) => bi < -EPS);
  const artCount = needArt.filter(Boolean).length;

  const colLabels: string[] = [
    ...varLabels,
    ...Array.from({ length: m }, (_, i) => `s${i}`),
  ];
  for (let k = 0; k < artCount; k++) colLabels.push(`a${k}`);

  const ncols = n + m + artCount;
  const T: number[][] = Array.from({ length: m + 1 }, () =>
    Array(ncols + 1).fill(0),
  );
  const basis: number[] = new Array(m);
  const artCols = new Set<number>();
  let artIdx = 0;

  for (let i = 0; i < m; i++) {
    if (!needArt[i]) {
      for (let j = 0; j < n; j++) T[i][j] = A[i][j];
      T[i][n + i] = 1;
      T[i][ncols] = b[i];
      basis[i] = n + i;
    } else {
      // (−A)x − s + a = −b  (RHS > 0)
      for (let j = 0; j < n; j++) T[i][j] = -A[i][j];
      T[i][n + i] = -1;
      const aCol = n + m + artIdx;
      T[i][aCol] = 1;
      T[i][ncols] = -b[i];
      basis[i] = aCol;
      artCols.add(aCol);
      artIdx++;
    }
  }

  return {
    T,
    m,
    nDecision: n,
    ncols,
    basis,
    colLabels,
    artCols,
    frames: [],
    problem,
    phase: artCount > 0 ? 1 : 2,
  };
}

function setPhase1Objective(tab: Tableau): void {
  const { T, m, ncols, artCols, basis } = tab;
  // Maximize −∑a  (c_a = −1) ⇒ tableau obj coeffs −c_a = +1, same convention as phase 2.
  for (let j = 0; j <= ncols; j++) T[m][j] = 0;
  for (const aCol of artCols) T[m][aCol] = 1;
  // Clear basic artificials so their obj coeffs are 0; RHS becomes −∑a₀.
  for (let i = 0; i < m; i++) {
    if (!artCols.has(basis[i])) continue;
    const aCol = basis[i];
    const coeff = T[m][aCol];
    if (Math.abs(coeff) < EPS) continue;
    for (let j = 0; j <= ncols; j++) T[m][j] -= coeff * T[i][j];
  }
}

function setPhase2Objective(tab: Tableau, c: number[]): void {
  const { T, m, ncols, nDecision, artCols, basis } = tab;
  for (let j = 0; j <= ncols; j++) T[m][j] = 0;
  for (let j = 0; j < nDecision; j++) T[m][j] = -c[j];
  // Artificial columns stay 0 (never re-enter); clear basic vars with nonzero obj
  for (let i = 0; i < m; i++) {
    const bi = basis[i];
    if (artCols.has(bi)) continue;
    const coeff = T[m][bi];
    if (Math.abs(coeff) < EPS) continue;
    for (let j = 0; j <= ncols; j++) T[m][j] -= coeff * T[i][j];
  }
}

function extractDecision(tab: Tableau): number[] {
  const x = new Array(tab.nDecision).fill(0);
  for (let i = 0; i < tab.m; i++) {
    const bi = tab.basis[i];
    if (bi < tab.nDecision) x[bi] = Math.max(0, roundEps(tab.T[i][tab.ncols]));
  }
  return x;
}

/** Solve max cᵀx s.t. Ax ≤ b, x ≥ 0 with full tableau frames. */
export function solveMaxWithTrace(
  A: number[][],
  b: number[],
  c: number[],
  varLabels: string[],
  problem: "primal" | "dual",
): SimplexOutcome {
  if (A.length === 0) {
    // Unconstrained max over x≥0: unbounded unless c≤0
    if (c.some((cj) => cj > EPS)) {
      return { ok: false, reason: "unbounded", frames: [] };
    }
    return {
      ok: true,
      x: c.map(() => 0),
      Z: 0,
      frames: [
        {
          note: "empty constraints; optimum at origin",
          phase: 2,
          Z: 0,
          problem,
          basis: [],
        },
      ],
    };
  }

  const tab = buildTableau(A, b, c, varLabels, problem);

  if (tab.artCols.size > 0) {
    tab.phase = 1;
    setPhase1Objective(tab);
    const p1 = runPhase(tab, "Phase 1");
    if (p1 === "iteration_limit") {
      return { ok: false, reason: "iteration_limit", frames: tab.frames };
    }
    if (p1 === "unbounded") {
      // Phase-1 unbounded should not happen for a proper auxiliary LP
      return { ok: false, reason: "infeasible", frames: tab.frames };
    }
    const w = tab.T[tab.m][tab.ncols];
    // Feasible iff artificial sum ≈ 0 and no artificial remains basic with positive level
    let artInBasis = false;
    for (let i = 0; i < tab.m; i++) {
      if (tab.artCols.has(tab.basis[i]) && tab.T[i][tab.ncols] > EPS) {
        artInBasis = true;
        break;
      }
    }
    if (w < -EPS || artInBasis) {
      captureFrame(tab, "Phase 1: infeasible (w < 0 or artificial basic)");
      return { ok: false, reason: "infeasible", frames: tab.frames };
    }
    // Drive remaining zero-level artificials out if possible (optional cleanup)
    for (let i = 0; i < tab.m; i++) {
      if (!tab.artCols.has(tab.basis[i])) continue;
      // Try pivot to a non-art column
      let enter = -1;
      for (let j = 0; j < tab.ncols; j++) {
        if (tab.artCols.has(j)) continue;
        if (Math.abs(tab.T[i][j]) > EPS) {
          enter = j;
          break;
        }
      }
      if (enter >= 0) {
        const leaveLabel = tab.colLabels[tab.basis[i]];
        const enterLabel = tab.colLabels[enter];
        pivot(tab, i, enter);
        captureFrame(
          tab,
          `Phase 1 cleanup: ${enterLabel} replaces ${leaveLabel}`,
          enterLabel,
          leaveLabel,
        );
      }
    }
  }

  tab.phase = 2;
  setPhase2Objective(tab, c);
  // Artificials must not re-enter in phase 2.
  const p2 = runPhase(tab, "Phase 2", tab.artCols);
  if (p2 === "iteration_limit") {
    return { ok: false, reason: "iteration_limit", frames: tab.frames };
  }
  if (p2 === "unbounded") {
    captureFrame(tab, "Phase 2: unbounded");
    return { ok: false, reason: "unbounded", frames: tab.frames };
  }

  const x = extractDecision(tab);
  const Z = roundEps(tab.T[tab.m][tab.ncols]);
  return { ok: true, x, Z, frames: tab.frames };
}

export function solvePrimalWithTrace(model: Model): SimplexOutcome {
  return solveMaxWithTrace(
    model.A,
    model.b,
    model.c,
    model.products.map((p, j) => `x:${p}`),
    "primal",
  );
}

/**
 * Dual: min bᵀy s.t. Aᵀy ≥ c, y ≥ 0
 * ≡ max (−b)ᵀy s.t. (−Aᵀ)y ≤ (−c), y ≥ 0
 */
export function solveDualWithTrace(model: Model): SimplexOutcome {
  const m = model.resources.length;
  const n = model.products.length;
  const AT: number[][] = Array.from({ length: n }, (_, j) =>
    Array.from({ length: m }, (_, i) => -model.A[i][j]),
  );
  const bDual = model.c.map((cj) => -cj);
  const cDual = model.b.map((bi) => -bi);
  const dual = solveMaxWithTrace(
    AT,
    bDual,
    cDual,
    model.resources.map((r) => `y:${r}`),
    "dual",
  );
  if (!dual.ok) return dual;
  // Dual objective we maximized is −bᵀy; report primal-dual Z = bᵀy = −Z_max
  return {
    ok: true,
    x: dual.x,
    Z: -dual.Z,
    frames: dual.frames,
  };
}

/** Full native LP: primal + dual → SolveResult + traces. */
export function solveLpNative(model: Model): {
  result: SolveResult;
  frames: SimplexTraceFrame[];
  dual_frames: SimplexTraceFrame[];
} {
  const primal = solvePrimalWithTrace(model);
  const dual = solveDualWithTrace(model);

  const frames = primal.frames;
  const dual_frames = dual.frames;

  if (!primal.ok) {
    const xZero = model.products.map(() => 0);
    const yZero = model.resources.map(() => 0);
    return {
      result: buildSolveResult(model, xZero, yZero, false),
      frames,
      dual_frames,
    };
  }

  const yVec = dual.ok
    ? dual.x
    : model.resources.map(() => 0);

  return {
    result: buildSolveResult(model, primal.x, yVec, true),
    frames,
    dual_frames,
  };
}
