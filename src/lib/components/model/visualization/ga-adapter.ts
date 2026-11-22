import type { Model, SolveResult, SolveTrace } from '$lib/domain';
import { computePcaBasis, meanVec } from './math';
import {
  emptyBounds,
  expandBounds,
  type OptimizationScene,
  type ProjectionMode,
  type SceneFace,
  type SceneFrame,
  type ScenePoint,
} from './types';
import {
  computeEdges,
  computeFaces3d,
  computeVertices,
  feasiblePolygon2d,
  getAllConstraints,
} from './polytope';

function defaultMode(dim: number): ProjectionMode {
  if (dim <= 2) return 'exact2d';
  if (dim === 3) return 'exact3d';
  if (dim === 4) return 'section3d';
  return 'selectedAxes';
}

export type GaSceneExtras = {
  lpOptimum?: SolveResult | null;
  pcaBasis?: number[][];
  pcaMean?: number[];
};

export function buildGaScene(
  model: Model,
  trace: Extract<SolveTrace, { method: 'ga' }> | null,
  opts?: {
    mode?: ProjectionMode;
    axisX?: number;
    axisY?: number;
    axisZ?: number;
    sectionAxis?: number;
    sectionValue?: number;
    sectionEps?: number;
  } & GaSceneExtras,
): OptimizationScene {
  const dim = model.products.length;
  const mode = opts?.mode ?? defaultMode(dim);
  const axisX = opts?.axisX ?? 0;
  const axisY = opts?.axisY ?? Math.min(1, dim - 1);
  const axisZ = opts?.axisZ ?? (dim >= 3 ? 2 : undefined);
  const sectionAxis = opts?.sectionAxis ?? (dim >= 4 ? dim - 1 : undefined);
  const sectionValue = opts?.sectionValue ?? 0;
  const sectionEps = opts?.sectionEps ?? 0.15;

  const generations = trace?.generations ?? [];
  let bounds = emptyBounds(dim);

  // Pool points for PCA / bounds
  const pool: number[][] = [];
  for (const g of generations) {
    for (const ind of g.population) {
      pool.push(ind.genes);
      bounds = expandBounds(bounds, [ind.genes]);
    }
    bounds = expandBounds(bounds, [g.bestEver.genes]);
  }

  let pcaBasis = opts?.pcaBasis;
  let pcaMean = opts?.pcaMean;
  if (mode === 'pca' && pool.length > 0 && (!pcaBasis || !pcaMean)) {
    pcaMean = meanVec(pool);
    pcaBasis = computePcaBasis(pool, 2);
  }

  const frames: SceneFrame[] = [];

  const userCons = model.resources.map((_, i) => ({
    a: model.A[i].slice(),
    b: model.b[i],
  }));

  const staticRegions =
    dim === 2
      ? (() => {
          const poly = feasiblePolygon2d(userCons);
          return poly.length >= 3
            ? [
                {
                  id: 'feasible',
                  points2d: poly,
                  kind: 'feasible' as const,
                  label: 'ОДР',
                  color: '#2563eb',
                  opacity: 0.12,
                },
              ]
            : [];
        })()
      : [];

  const staticFaces: SceneFace[] = [];
  const staticEdgeLines: SceneFrame['lines'] = [];
  if (dim >= 3 && (mode === 'exact3d' || mode === 'selectedAxes')) {
    const axes = [axisX, axisY, axisZ ?? Math.min(2, dim - 1)];
    const reducedCons = userCons.map((c) => ({
      a: axes.map((ai) => c.a[ai] ?? 0),
      b: c.b,
    }));
    const all = getAllConstraints(reducedCons, 3);
    const verts = computeVertices(all, 3);
    const modelVerts = verts.map((v) => {
      const full = new Array(dim).fill(0);
      axes.forEach((ai, i) => {
        full[ai] = v.point[i] ?? 0;
      });
      return full;
    });
    bounds = expandBounds(bounds, modelVerts);
    const edges = computeEdges(verts, 3);
    for (const [i, j] of edges) {
      staticEdgeLines.push({
        id: `e-${i}-${j}`,
        points: [modelVerts[i], modelVerts[j]],
        kind: 'edge',
        color: '#4fd1c5',
      });
    }
    const faces = computeFaces3d(verts, all);
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
        kind: 'feasible',
        label: 'ОДР',
        color: '#2563eb',
        opacity: 0.14,
      });
    });
  }

  generations.forEach((gen, idx) => {
    let pop = gen.population;
    if (mode === 'section3d' && sectionAxis != null && dim >= 4) {
      pop = pop.filter(
        (ind) =>
          Math.abs(ind.genes[sectionAxis] - sectionValue) <=
          Math.max(sectionEps, (bounds.max[sectionAxis] - bounds.min[sectionAxis]) * 0.08),
      );
    }

    const points: ScenePoint[] = pop.map((ind, i) => ({
      id: `p-${gen.generation}-${i}`,
      coords: ind.genes,
      kind: ind.feasible ? 'feasible' : 'infeasible',
      size: 4,
      color: ind.feasible ? '#3B82F6' : '#E57373',
      meta: {
        fitness: ind.fitness,
        rawFitness: ind.rawFitness,
        feasible: ind.feasible,
      },
    }));

    points.push({
      id: `best-${gen.generation}`,
      coords: gen.population[gen.bestIndex]?.genes ?? gen.bestEver.genes,
      kind: 'best',
      label: 'Лучшая особь',
      size: 7,
      color: '#22C55E',
    });

    points.push({
      id: `best-ever-${gen.generation}`,
      coords: gen.bestEver.genes,
      kind: 'bestEver',
      label: 'Лучшая за всё время',
      size: 6,
      color: '#15803d',
    });

    if (opts?.lpOptimum?.x) {
      const coords = model.products.map((p) => opts.lpOptimum!.x[p] ?? 0);
      points.push({
        id: 'lp-opt',
        coords,
        kind: 'baseline',
        label: 'LP оптимум',
        size: 7,
        color: '#F59E0B',
      });
      bounds = expandBounds(bounds, [coords]);
    }

    frames.push({
      stepIndex: idx,
      stepLabel: `Поколение ${gen.generation}`,
      points,
      lines: staticEdgeLines.map((l) => ({
        ...l,
        points: l.points.map((p) => p.slice()),
      })),
      regions: staticRegions,
      faces: staticFaces.map((f) => ({
        ...f,
        points: f.points.map((p) => p.slice()),
      })),
      metrics: {
        поколение: gen.generation,
        лучшее: gen.bestFitness,
        среднее: gen.meanFitness,
        худшее: gen.worstFitness,
        'в ОДР': `${gen.feasibleCount}/${gen.population.length}`,
      },
    });
  });

  if (frames.length === 0) {
    frames.push({
      stepIndex: 0,
      stepLabel: 'Нет данных',
      points: [],
      lines: staticEdgeLines,
      regions: staticRegions,
      faces: staticFaces,
      metrics: {},
    });
  }

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

export { computePcaBasis, meanVec };
