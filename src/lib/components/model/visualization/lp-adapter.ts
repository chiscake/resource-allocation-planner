import type { Model, SolveTrace } from '$lib/domain';
import {
  computeEdges,
  computeFaces3d,
  computeSection3d,
  computeVertices,
  constraintSegment2d,
  embedAxesPoint,
  feasiblePolygon2d,
  getAllConstraints,
} from './polytope';
import {
  emptyBounds,
  expandBounds,
  type OptimizationScene,
  type SceneFace,
  type SceneFrame,
  type SceneLine,
  type ScenePoint,
  type ProjectionMode,
} from './types';

function defaultMode(dim: number): ProjectionMode {
  if (dim <= 2) return 'exact2d';
  if (dim === 3) return 'exact3d';
  if (dim === 4) return 'section3d';
  return 'selectedAxes';
}

function constraintsFromModel(model: Model) {
  return model.resources.map((_, i) => ({
    a: model.A[i].slice(),
    b: model.b[i],
  }));
}

function displayAxesTriple(
  axisX: number,
  axisY: number,
  axisZ: number | undefined,
  dim: number,
): [number, number, number] {
  return [axisX, axisY, axisZ ?? Math.min(2, dim - 1)];
}

export function buildLpScene(
  model: Model,
  trace: Extract<SolveTrace, { method: 'lp' }> | null,
  opts?: {
    mode?: ProjectionMode;
    axisX?: number;
    axisY?: number;
    axisZ?: number;
    sectionAxis?: number;
    sectionValue?: number;
  },
): OptimizationScene {
  const dim = model.products.length;
  const mode = opts?.mode ?? defaultMode(dim);
  const axisX = opts?.axisX ?? 0;
  const axisY = opts?.axisY ?? Math.min(1, dim - 1);
  const axisZ = opts?.axisZ ?? (dim >= 3 ? 2 : undefined);
  const sectionAxis = opts?.sectionAxis ?? (dim >= 4 ? dim - 1 : undefined);
  const sectionValue = opts?.sectionValue ?? 0;
  const axes = displayAxesTriple(axisX, axisY, axisZ, dim);

  const frames: SceneFrame[] = [];
  const primal = trace?.frames ?? [];
  let bounds = emptyBounds(dim);

  const userCons = constraintsFromModel(model);
  const staticLines: SceneLine[] = [];
  const staticRegions: SceneFrame['regions'] = [];
  const staticFaces: SceneFace[] = [];
  let sectionModelVerts: number[][] = [];

  if (dim === 2 && (mode === 'exact2d' || mode === 'selectedAxes')) {
    const poly = feasiblePolygon2d(userCons);
    if (poly.length >= 3) {
      staticRegions.push({
        id: 'feasible',
        points2d: poly,
        kind: 'feasible',
        label: 'ОДР',
        color: '#2563eb',
        opacity: 0.12,
      });
      bounds = expandBounds(
        bounds,
        poly.map(([x, y]) => {
          const v = new Array(dim).fill(0);
          v[0] = x;
          v[1] = y;
          return v;
        }),
      );
    }
    const domain = {
      xMin: bounds.min[0],
      xMax: bounds.max[0],
      yMin: bounds.min[1],
      yMax: bounds.max[1],
    };
    userCons.forEach((c, i) => {
      const seg = constraintSegment2d(c.a, c.b, domain);
      if (seg.length === 2) {
        staticLines.push({
          id: `c-${i}`,
          points: seg.map(([x, y]) => {
            const v = new Array(dim).fill(0);
            v[0] = x;
            v[1] = y;
            return v;
          }),
          kind: 'constraint',
          label: model.resources[i],
          color: '#a3a3a3',
          dash: true,
        });
      }
    });
  }

  if (mode === 'section3d' && dim >= 4 && sectionAxis != null) {
    // Slice x[sectionAxis] = sectionValue onto the three selected display axes.
    const section = computeSection3d(userCons, dim, axes, sectionAxis, sectionValue);
    sectionModelVerts = section.modelVerts;
    bounds = expandBounds(bounds, section.modelVerts);
    for (const [i, j] of section.edges) {
      staticLines.push({
        id: `e-${i}-${j}`,
        points: [section.modelVerts[i], section.modelVerts[j]],
        kind: 'edge',
        color: '#4fd1c5',
      });
    }
    section.faces.forEach((pts, i) => {
      staticFaces.push({
        id: `face-${i}`,
        points: pts.map((pt) =>
          embedAxesPoint(pt, dim, axes, { axis: sectionAxis, value: sectionValue }),
        ),
        kind: 'feasible',
        label: 'ОДР',
        color: '#2563eb',
        opacity: 0.14,
      });
    });
  } else if (mode === 'project4d' && dim >= 4) {
    const all = getAllConstraints(userCons, dim);
    const verts = computeVertices(all, dim);
    const edges = computeEdges(verts, dim);
    bounds = expandBounds(
      bounds,
      verts.map((v) => v.point),
    );
    for (const [i, j] of edges) {
      staticLines.push({
        id: `e-${i}-${j}`,
        points: [verts[i].point, verts[j].point],
        kind: 'edge',
        color: '#4fd1c5',
      });
    }
  } else if (dim >= 3 && dim <= 4 && (mode === 'exact3d' || mode === 'selectedAxes')) {
    // ОДР on the three selected axes (non-selected products treated as 0 in A·x).
    const reducedCons = userCons.map((c) => ({
      a: axes.map((ai) => c.a[ai] ?? 0),
      b: c.b,
    }));
    const reducedAll = getAllConstraints(reducedCons, 3);
    const reducedVerts = computeVertices(reducedAll, 3);
    const modelVerts = reducedVerts.map((v) => embedAxesPoint(v.point, dim, axes));
    bounds = expandBounds(bounds, modelVerts);
    const edges = computeEdges(reducedVerts, 3);
    for (const [i, j] of edges) {
      staticLines.push({
        id: `e-${i}-${j}`,
        points: [modelVerts[i], modelVerts[j]],
        kind: 'edge',
        color: '#4fd1c5',
      });
    }
    const faces = computeFaces3d(reducedVerts, reducedAll);
    faces.forEach((pts, i) => {
      staticFaces.push({
        id: `face-${i}`,
        points: pts.map((pt) => embedAxesPoint(pt, dim, axes)),
        kind: 'feasible',
        label: 'ОДР',
        color: '#2563eb',
        opacity: 0.14,
      });
    });
  }

  const trajPts: number[][] = [];
  const steps = primal.length > 0 ? primal : [{ Z: 0, x: model.products.map(() => 0), note: '—' }];

  const sectionEps =
    sectionAxis != null
      ? Math.max(0.05, ((bounds.max[sectionAxis] ?? 1) - (bounds.min[sectionAxis] ?? 0)) * 0.08)
      : 0;

  steps.forEach((frame, idx) => {
    const x = frame.x ?? model.products.map(() => 0);
    trajPts.push(x);
    bounds = expandBounds(bounds, [x]);

    const points: ScenePoint[] = [];
    trajPts.forEach((pt, ti) => {
      const nearSection =
        mode !== 'section3d' ||
        sectionAxis == null ||
        Math.abs((pt[sectionAxis] ?? 0) - sectionValue) <= sectionEps;
      if (!nearSection && ti !== trajPts.length - 1) return;
      // Current marker: pin section coord onto the slice plane.
      const coords =
        mode === 'section3d' && sectionAxis != null && ti === trajPts.length - 1
          ? pt.map((v, i) => (i === sectionAxis ? sectionValue : v))
          : pt;
      points.push({
        id: `traj-${ti}`,
        coords,
        kind: ti === trajPts.length - 1 ? 'best' : 'trajectory',
        label: ti === trajPts.length - 1 ? 'Текущая' : undefined,
        size: ti === trajPts.length - 1 ? 7 : 3.5,
        color: '#f2679c',
      });
    });

    if (mode === 'section3d' && sectionModelVerts.length > 0) {
      sectionModelVerts.forEach((pt, vi) => {
        points.push({
          id: `v-${vi}`,
          coords: pt,
          kind: 'vertex',
          size: 2.5,
          color: '#8b93a7',
        });
      });
    } else if (dim >= 3 && dim <= 4 && mode !== 'section3d') {
      const all = getAllConstraints(userCons, dim);
      const verts = computeVertices(all, dim);
      verts.forEach((v, vi) => {
        points.push({
          id: `v-${vi}`,
          coords: v.point,
          kind: 'vertex',
          size: 2.5,
          color: '#8b93a7',
        });
      });
    }

    const trajLine: SceneLine | null =
      trajPts.length >= 2
        ? {
            id: 'traj-line',
            points: trajPts.map((p) =>
              mode === 'section3d' && sectionAxis != null
                ? p.map((v, i) => (i === sectionAxis ? sectionValue : v))
                : p.slice(),
            ),
            kind: 'trajectory',
            color: '#f2679c',
          }
        : null;

    frames.push({
      stepIndex: idx,
      stepLabel: frame.note ?? `Шаг ${idx}`,
      points,
      lines: [...staticLines, ...(trajLine ? [trajLine] : [])],
      regions: staticRegions.map((r) => ({ ...r })),
      faces: staticFaces.map((f) => ({ ...f, points: f.points.map((p) => p.slice()) })),
      metrics: {
        Z: frame.Z ?? Number.NaN,
        phase: frame.phase ?? '—',
        entering: frame.entering ?? '—',
        leaving: frame.leaving ?? '—',
      },
    });
  });

  return {
    dim,
    productNames: [...model.products],
    mode,
    axisX,
    axisY,
    axisZ,
    sectionAxis,
    sectionValue,
    frames,
    bounds,
  };
}
