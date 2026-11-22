/** Shared scene primitives for LP / GA visualization. */

export type VecN = number[];

export type ScenePoint = {
  id: string;
  coords: VecN;
  label?: string;
  /** feasible | infeasible | best | trajectory | optimum | baseline */
  kind:
    | 'feasible'
    | 'infeasible'
    | 'best'
    | 'bestEver'
    | 'trajectory'
    | 'optimum'
    | 'baseline'
    | 'vertex'
    | 'compare';
  color?: string;
  size?: number;
  meta?: Record<string, unknown>;
};

export type SceneLine = {
  id: string;
  points: VecN[];
  label?: string;
  kind: 'edge' | 'constraint' | 'level' | 'trajectory' | 'axis';
  color?: string;
  dash?: boolean;
};

export type SceneRegion = {
  id: string;
  /** Polygon in the projected 2D plane (after projection). */
  points2d: [number, number][];
  label?: string;
  kind: 'feasible' | 'level';
  color?: string;
  opacity?: number;
};

/** Polygon face in model space (for 3D feasible region rendering). */
export type SceneFace = {
  id: string;
  points: VecN[];
  label?: string;
  kind: 'feasible';
  color?: string;
  opacity?: number;
};

export type SceneOverlayMarker = {
  id: string;
  coords: VecN;
  label: string;
  color: string;
  visible: boolean;
};

export type ProjectionMode =
  'exact2d' | 'exact3d' | 'section3d' | 'project4d' | 'selectedAxes' | 'pca' | 'parallel';

export type SceneFrame = {
  stepIndex: number;
  stepLabel: string;
  points: ScenePoint[];
  lines: SceneLine[];
  regions: SceneRegion[];
  /** 3D polytope faces (optional; used for exact 3D ОДР). */
  faces?: SceneFace[];
  overlays?: SceneOverlayMarker[];
  metrics?: Record<string, string | number>;
};

export type OptimizationScene = {
  dim: number;
  productNames: string[];
  mode: ProjectionMode;
  /** Axis indices into product space for selectedAxes / section. */
  axisX: number;
  axisY: number;
  axisZ?: number;
  /** Fixed coordinate for section mode (x_k = c). */
  sectionAxis?: number;
  sectionValue?: number;
  frames: SceneFrame[];
  bounds: { min: VecN; max: VecN };
};

export type ProjectedPoint = {
  x: number;
  y: number;
  depth: number;
  source: ScenePoint;
};

export function emptyBounds(dim: number): { min: VecN; max: VecN } {
  return {
    min: Array(dim).fill(0),
    max: Array(dim).fill(1),
  };
}

export function expandBounds(
  bounds: { min: VecN; max: VecN },
  pts: VecN[],
): { min: VecN; max: VecN } {
  const dim = bounds.min.length;
  const min = bounds.min.slice();
  const max = bounds.max.slice();
  for (const p of pts) {
    for (let i = 0; i < dim; i++) {
      if (!Number.isFinite(p[i])) continue;
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  }
  for (let i = 0; i < dim; i++) {
    if (max[i] - min[i] < 1e-9) {
      max[i] = min[i] + 1;
    }
  }
  return { min, max };
}

/** Serializable 3D view state for sandboxes / debugging. */
export type SceneViewDebug = {
  quat: [number, number, number, number];
  lookFrom: number[];
  rotationMode: 'turntable' | 'trackball';
  zoom: number;
  panX: number;
  panY: number;
  angles4: {
    xy: number;
    xz: number;
    yz: number;
    xw: number;
    yw: number;
    zw: number;
  };
  /** Row-major 4×4 view←world (project4d). */
  rot4?: number[];
  /** w-components of world axes X/Y/Z/W in view space. */
  axisW?: { x: number; y: number; z: number; w: number };
  projection: 'viewOrtho' | 'perspective4d';
};
