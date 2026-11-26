import { dot, normalize } from './math';
import type { VecN } from './types';

const EPS = 1e-6;

function solveLinear(Amat: number[][], bvec: number[]): number[] | null {
  const n = Amat.length;
  const M = Amat.map((row, i) => [...row, bvec[i]]);
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > maxVal) {
        maxVal = Math.abs(M[r][col]);
        pivotRow = r;
      }
    }
    if (maxVal < 1e-9) return null;
    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }
    const pv = M[col][col];
    for (let j = 0; j <= n; j++) M[col][j] /= pv;
    for (let r = 0; r < n; r++) {
      if (r !== col) {
        const f = M[r][col];
        if (Math.abs(f) > 1e-12) {
          for (let j = 0; j <= n; j++) M[r][j] -= f * M[col][j];
        }
      }
    }
  }
  return M.map((row) => row[n]);
}

function kCombinations(arr: number[], k: number): number[][] {
  const results: number[][] = [];
  const combo: number[] = [];
  (function backtrack(start: number) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      backtrack(i + 1);
      combo.pop();
    }
  })(0);
  return results;
}

export type Halfspace = { a: VecN; b: number; kind?: string };

export function getAllConstraints(
  userConstraints: { a: number[]; b: number }[],
  dim: number,
): Halfspace[] {
  const all: Halfspace[] = userConstraints.map((c) => ({
    a: c.a.slice(0, dim),
    b: c.b,
    kind: 'user',
  }));
  for (let i = 0; i < dim; i++) {
    const a = new Array(dim).fill(0);
    a[i] = -1;
    all.push({ a, b: 0, kind: 'nonneg' });
  }
  return all;
}

export type PolytopeVertex = { point: VecN; active: number[] };

/** Enumerate vertices — only safe for small dim (≤4) and few constraints. */
export function computeVertices(allConstraints: Halfspace[], dim: number): PolytopeVertex[] {
  if (dim < 2 || dim > 4) return [];
  if (allConstraints.length > 16) return [];
  const idxs = allConstraints.map((_, i) => i);
  const combos = kCombinations(idxs, dim);
  const vertices: PolytopeVertex[] = [];
  for (const combo of combos) {
    const A = combo.map((i) => allConstraints[i].a);
    const b = combo.map((i) => allConstraints[i].b);
    const sol = solveLinear(A, b);
    if (!sol) continue;
    let feasible = true;
    const active: number[] = [];
    for (let i = 0; i < allConstraints.length; i++) {
      const { a, b: bi } = allConstraints[i];
      const val = dot(a, sol);
      if (val > bi + 1e-5) {
        feasible = false;
        break;
      }
      if (Math.abs(val - bi) < 1e-4) active.push(i);
    }
    if (!feasible) continue;
    const dup = vertices.find((v) => v.point.every((p, k) => Math.abs(p - sol[k]) < 1e-4));
    if (!dup) vertices.push({ point: sol, active });
  }
  return vertices;
}

export function computeEdges(vertices: PolytopeVertex[], dim: number): [number, number][] {
  const edges: [number, number][] = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const common = vertices[i].active.filter((x) => vertices[j].active.includes(x));
      if (common.length >= dim - 1) edges.push([i, j]);
    }
  }
  return edges;
}

/** Ordered polygonal faces for a 3D polytope (one face per binding constraint). */
export function computeFaces3d(vertices: PolytopeVertex[], constraints: Halfspace[]): VecN[][] {
  if (vertices.length < 3) return [];
  const faces: VecN[][] = [];
  for (let ci = 0; ci < constraints.length; ci++) {
    const faceVerts = vertices.filter((v) => v.active.includes(ci));
    if (faceVerts.length < 3) continue;
    const c = faceVerts.reduce(
      (acc, v) => [acc[0] + v.point[0], acc[1] + v.point[1], acc[2] + v.point[2]],
      [0, 0, 0],
    );
    const cx = c[0] / faceVerts.length;
    const cy = c[1] / faceVerts.length;
    const cz = c[2] / faceVerts.length;
    const normal = normalize(constraints[ci].a.slice(0, 3));
    // Build orthonormal basis in the face plane.
    let u = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    u = normalize([
      u[1] * normal[2] - u[2] * normal[1],
      u[2] * normal[0] - u[0] * normal[2],
      u[0] * normal[1] - u[1] * normal[0],
    ]);
    const v = [
      normal[1] * u[2] - normal[2] * u[1],
      normal[2] * u[0] - normal[0] * u[2],
      normal[0] * u[1] - normal[1] * u[0],
    ];
    const ordered = [...faceVerts].sort((a, b) => {
      const ax = a.point[0] - cx;
      const ay = a.point[1] - cy;
      const az = a.point[2] - cz;
      const bx = b.point[0] - cx;
      const by = b.point[1] - cy;
      const bz = b.point[2] - cz;
      const aAng = Math.atan2(ax * v[0] + ay * v[1] + az * v[2], ax * u[0] + ay * u[1] + az * u[2]);
      const bAng = Math.atan2(bx * v[0] + by * v[1] + bz * v[2], bx * u[0] + by * u[1] + bz * u[2]);
      return aAng - bAng;
    });
    faces.push(ordered.map((fv) => fv.point.slice()));
  }
  return faces;
}

/** 2D feasible polygon from halfspaces via vertex enum + angular sort. */
export function feasiblePolygon2d(constraints: { a: number[]; b: number }[]): [number, number][] {
  const all = getAllConstraints(constraints, 2);
  const verts = computeVertices(all, 2);
  if (verts.length < 3) return [];
  const cx = verts.reduce((s, v) => s + v.point[0], 0) / verts.length;
  const cy = verts.reduce((s, v) => s + v.point[1], 0) / verts.length;
  const sorted = [...verts].sort(
    (a, b) =>
      Math.atan2(a.point[1] - cy, a.point[0] - cx) - Math.atan2(b.point[1] - cy, b.point[0] - cx),
  );
  return sorted.map((v) => [v.point[0], v.point[1]] as [number, number]);
}

/**
 * 3D cross-section of an nD polytope at `x[sectionAxis] = sectionValue`,
 * expressed in the three `displayAxes` coordinates.
 * Same construction as `.tmp/LP4DVisualizer` (generalized beyond hard-coded x₄).
 */
export function computeSection3d(
  userConstraints: { a: number[]; b: number }[],
  dim: number,
  displayAxes: [number, number, number],
  sectionAxis: number,
  sectionValue: number,
): {
  feasible: boolean;
  vertices: PolytopeVertex[];
  edges: [number, number][];
  faces: VecN[][];
  /** Full-dim embeddings of section vertices (display + fixed section). */
  modelVerts: VecN[];
} {
  const empty = {
    feasible: false,
    vertices: [] as PolytopeVertex[],
    edges: [] as [number, number][],
    faces: [] as VecN[][],
    modelVerts: [] as VecN[],
  };
  if (dim < 4 || sectionValue < -EPS) return empty;
  if (new Set(displayAxes).size !== 3) return empty;
  if (displayAxes.some((ai) => ai === sectionAxis || ai < 0 || ai >= dim)) return empty;
  if (sectionAxis < 0 || sectionAxis >= dim) return empty;

  const reduced: { a: number[]; b: number }[] = [];
  let feasibleK = true;
  for (const con of userConstraints) {
    const a3 = displayAxes.map((ai) => con.a[ai] ?? 0);
    const rhs = con.b - (con.a[sectionAxis] ?? 0) * sectionValue;
    if (Math.hypot(a3[0], a3[1], a3[2]) < 1e-9) {
      if (rhs < -1e-6) feasibleK = false;
      continue;
    }
    reduced.push({ a: a3, b: rhs });
  }
  if (!feasibleK) return empty;

  const all = getAllConstraints(reduced, 3);
  const vertices = computeVertices(all, 3);
  const edges = computeEdges(vertices, 3);
  const faces = computeFaces3d(vertices, all);
  const modelVerts = vertices.map((v) => {
    const full = new Array(dim).fill(0);
    displayAxes.forEach((ai, j) => {
      full[ai] = v.point[j] ?? 0;
    });
    full[sectionAxis] = sectionValue;
    return full;
  });
  return { feasible: true, vertices, edges, faces, modelVerts };
}

/** Embed a 3D point on selected product axes into full model space. */
export function embedAxesPoint(
  pt3: VecN,
  dim: number,
  axes: number[],
  fixed?: { axis: number; value: number },
): VecN {
  const full = new Array(dim).fill(0);
  axes.forEach((ai, j) => {
    full[ai] = pt3[j] ?? 0;
  });
  if (fixed) full[fixed.axis] = fixed.value;
  return full;
}

export function constraintSegment2d(
  a: number[],
  b: number,
  domain: { xMin: number; xMax: number; yMin: number; yMax: number },
): [number, number][] {
  // a0 x + a1 y = b, clip to domain box
  const pts: [number, number][] = [];
  const tryAdd = (x: number, y: number) => {
    if (
      x >= domain.xMin - EPS &&
      x <= domain.xMax + EPS &&
      y >= domain.yMin - EPS &&
      y <= domain.yMax + EPS
    ) {
      pts.push([x, y]);
    }
  };
  if (Math.abs(a[1]) > EPS) {
    tryAdd(domain.xMin, (b - a[0] * domain.xMin) / a[1]);
    tryAdd(domain.xMax, (b - a[0] * domain.xMax) / a[1]);
  }
  if (Math.abs(a[0]) > EPS) {
    tryAdd((b - a[1] * domain.yMin) / a[0], domain.yMin);
    tryAdd((b - a[1] * domain.yMax) / a[0], domain.yMax);
  }
  // dedupe
  const uniq: [number, number][] = [];
  for (const p of pts) {
    if (!uniq.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6)) {
      uniq.push(p);
    }
  }
  return uniq.slice(0, 2);
}
