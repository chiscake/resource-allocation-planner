import type { Model, SolveTrace } from "$lib/domain";
import {
  computeEdges,
  computeFaces3d,
  computeVertices,
  constraintSegment2d,
  feasiblePolygon2d,
  getAllConstraints,
} from "./polytope";
import {
  emptyBounds,
  expandBounds,
  type OptimizationScene,
  type SceneFace,
  type SceneFrame,
  type SceneLine,
  type ScenePoint,
  type ProjectionMode,
} from "./types";

function defaultMode(dim: number): ProjectionMode {
  if (dim <= 2) return "exact2d";
  if (dim === 3) return "exact3d";
  if (dim === 4) return "section3d";
  return "selectedAxes";
}

function constraintsFromModel(model: Model) {
  return model.resources.map((_, i) => ({
    a: model.A[i].slice(),
    b: model.b[i],
  }));
}

export function buildLpScene(
  model: Model,
  trace: Extract<SolveTrace, { method: "lp" }> | null,
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

  const frames: SceneFrame[] = [];
  const primal = trace?.frames ?? [];
  let bounds = emptyBounds(dim);

  const userCons = constraintsFromModel(model);
  const staticLines: SceneLine[] = [];
  const staticRegions: SceneFrame["regions"] = [];
  const staticFaces: SceneFace[] = [];

  if (dim === 2 && (mode === "exact2d" || mode === "selectedAxes")) {
    const poly = feasiblePolygon2d(userCons);
    if (poly.length >= 3) {
      staticRegions.push({
        id: "feasible",
        points2d: poly,
        kind: "feasible",
        label: "ОДР",
        color: "#2563eb",
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
          kind: "constraint",
          label: model.resources[i],
          color: "#a3a3a3",
          dash: true,
        });
      }
    });
  }

  // Low-dim polytope edges/faces for 3D/4D
  if (dim >= 3 && dim <= 4 && (mode === "exact3d" || mode === "project4d" || mode === "section3d" || mode === "selectedAxes")) {
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
        kind: "edge",
        color: "#4fd1c5",
      });
    }
    if (mode === "exact3d" || mode === "selectedAxes") {
      const axes = [axisX, axisY, axisZ ?? Math.min(2, dim - 1)];
      const reducedCons = userCons.map((c) => ({
        a: axes.map((ai) => c.a[ai] ?? 0),
        b: c.b,
      }));
      const reducedAll = getAllConstraints(reducedCons, 3);
      const reducedVerts = computeVertices(reducedAll, 3);
      const faces = computeFaces3d(reducedVerts, reducedAll);
      faces.forEach((pts, i) => {
        staticFaces.push({
          id: `face-${i}`,
          points: pts.map((pt) => {
            const full = new Array(dim).fill(0);
            axes.forEach((ai, j) => {
              full[ai] = pt[j] ?? 0;
            });
            return full;
          }),
          kind: "feasible",
          label: "ОДР",
          color: "#2563eb",
          opacity: 0.14,
        });
      });
    }
  }

  const trajPts: number[][] = [];
  const steps = primal.length > 0 ? primal : [{ Z: 0, x: model.products.map(() => 0), note: "—" }];

  steps.forEach((frame, idx) => {
    const x =
      frame.x ??
      model.products.map((p) => 0);
    trajPts.push(x);
    bounds = expandBounds(bounds, [x]);

    const points: ScenePoint[] = [];
    // trajectory so far
    trajPts.forEach((pt, ti) => {
      points.push({
        id: `traj-${ti}`,
        coords: pt,
        kind: ti === trajPts.length - 1 ? "best" : "trajectory",
        label: ti === trajPts.length - 1 ? "Текущая" : undefined,
        size: ti === trajPts.length - 1 ? 7 : 3.5,
        color: "#f2679c",
      });
    });

    // polytope vertices when available
    if (dim >= 3 && dim <= 4) {
      const all = getAllConstraints(userCons, dim);
      const verts = computeVertices(all, dim);
      verts.forEach((v, vi) => {
        points.push({
          id: `v-${vi}`,
          coords: v.point,
          kind: "vertex",
          size: 2.5,
          color: "#8b93a7",
        });
      });
    }

    const trajLine: SceneLine | null =
      trajPts.length >= 2
        ? {
            id: "traj-line",
            points: trajPts.map((p) => p.slice()),
            kind: "trajectory",
            color: "#f2679c",
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
        phase: frame.phase ?? "—",
        entering: frame.entering ?? "—",
        leaving: frame.leaving ?? "—",
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
