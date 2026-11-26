/** Hardcoded lineage-graph render / physics knobs (no UI settings). */

export const GRAPH = {
  /** Node radius in world units. */
  rootRadius: 18,
  sensitivityRadius: 12,
  /** Force layout. */
  iterations: 180,
  repulsion: 2200,
  springLengthParent: 90,
  springLengthFork: 140,
  springStrength: 0.08,
  damping: 0.85,
  /** Pull children downward / forks rightward (world units per step). */
  biasDown: 0.35,
  biasRightFork: 0.25,
  centerPull: 0.002,
  /** Camera. */
  minScale: 0.35,
  maxScale: 2.5,
  wheelZoomFactor: 1.08,
  /** Show root name chips when zoomed out to this scale or below. */
  rootLabelMaxScale: 1,
  rootLabelFontPx: 11,
  rootLabelPadX: 6,
  rootLabelPadY: 3,
  rootLabelGapPx: 8,
  rootLabelMaxChars: 28,
  /** Directed edge markers: step in screen pixels. */
  arrowStepPx: 28,
  arrowSizePx: 6,
  /** Hit testing. */
  edgeHitPx: 8,
  dragClickSlopPx: 3,
  /** Selection ring: gap outside node radius (screen px). */
  selectionRingGapPx: 4,
  selectionRingWidthPx: 2,
  /** Colors (Cartesia-aligned). */
  colorRoot: '#2563eb',
  colorSensitivity: '#2563eb',
  colorSensitivityFill: '#ffffff',
  colorGray: '#a3a3a3',
  colorEdgeParent: '#94a3b8',
  colorEdgeFork: '#2563eb',
  colorSelected: '#1d4fd7',
  colorBg: '#fafafa',
  colorLabel: '#171717',
} as const;
