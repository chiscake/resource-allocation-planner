/** Device preference for 3D orbit method (UI-only; not in model schema). */

export type VizRotationMode = "turntable" | "trackball";

const ROTATION_KEY = "rap_viz_rotation_mode";

export function getVizRotationMode(): VizRotationMode {
  if (typeof localStorage === "undefined") return "turntable";
  const raw = localStorage.getItem(ROTATION_KEY);
  // Migrate legacy "arcball" key value from earlier UI.
  if (raw === "trackball" || raw === "arcball") return "trackball";
  return "turntable";
}

export function setVizRotationMode(mode: VizRotationMode): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ROTATION_KEY, mode);
}
