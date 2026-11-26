import type { ProjectionMode } from './types';

/** Display axes for 3D projection — always scene picks, never hard-coded [0,1,2]. */
export function sceneDisplayAxes(scene: {
  mode: ProjectionMode;
  axisX: number;
  axisY: number;
  axisZ?: number;
}): number[] {
  return [scene.axisX, scene.axisY, scene.axisZ ?? scene.axisX].filter(
    (v): v is number => v != null,
  );
}

export type TooltipCoord = {
  name: string;
  value: number;
  /** True when this product axis is one of the scene display axes. */
  highlight?: boolean;
};

/** Full-vector tooltip rows; scene axes highlighted. */
export function pointTooltipCoords(
  coords: number[],
  productNames: string[],
  highlightAxes: number[],
): TooltipCoord[] {
  const hi = new Set(highlightAxes);
  return coords.map((value, i) => ({
    name: productNames[i] ?? `x${i + 1}`,
    value,
    highlight: hi.has(i),
  }));
}
