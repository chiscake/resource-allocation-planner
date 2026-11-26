<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import type {
    OptimizationScene,
    SceneLine,
    ScenePoint,
    SceneRegion,
    SceneViewDebug,
  } from './types';
  import {
    boundingCenterScale,
    normalizePoint,
    project3to2,
    projectViewOrtho,
    unprojectViewOrthoZ0,
    project4to3,
    projectPca,
    rotateByQuat,
    selectAxes,
    arcballDelta,
    applyTrackballOrbit,
    applyTurntableOrbit,
    DEFAULT_ANGLES4,
    mat4Apply,
    mat4Col,
    mat4FromAngles4,
    quatConjugate,
    quatForViewFrom,
    quatSlerp,
    VIEW_TOWARD_CAMERA,
    type Angles4,
    type Mat4,
    type Quat,
  } from './math';
  import { computePcaBasis, meanVec } from './ga-adapter';
  import { pointTooltipCoords, sceneDisplayAxes } from './scene-axes';
  import {
    getVizRotationMode,
    setVizRotationMode,
    type VizRotationMode,
  } from '$lib/display/vizPrefs';
  import { t } from '$lib/i18n';
  import ViewGizmo from './ViewGizmo.svelte';

  let {
    scene,
    stepIndex = 0,
    autoRotate = $bindable(false),
    angles4 = $bindable<Angles4>({ ...DEFAULT_ANGLES4 }),
    objectiveCoefficients = [],
    onPointClick,
    viewDebug = $bindable(null),
    /** Height/sizing classes for the plot surface only (not the selection strip). */
    plotClass = 'min-h-[200px] h-full',
    /** When true, root fills parent height (fullscreen / flex hosts). */
    fill = false,
  }: {
    scene: OptimizationScene;
    stepIndex?: number;
    autoRotate?: boolean;
    /** 4D plane angles (project4d); sliders + orbit update these. */
    angles4?: Angles4;
    objectiveCoefficients?: number[];
    onPointClick?: (p: ScenePoint) => void;
    /** Live view metadata for sandboxes / debugging (optional). */
    viewDebug?: SceneViewDebug | null;
    plotClass?: string;
    fill?: boolean;
  } = $props();

  let wrapEl: HTMLDivElement | undefined = $state();
  let canvasEl: HTMLCanvasElement | undefined = $state();
  let cssW = $state(640);
  let cssH = $state(420);
  let dpr = $state(1);

  /** Default: isometric-ish look from (+,+,+) with Z-up. */
  const DEFAULT_QUAT: Quat = quatForViewFrom([1, 1, 1]);
  const SNAP_MS = 320;

  let zoom = $state(0.5);
  let panX = $state(0);
  let panY = $state(0);
  let cursor = $state('grab');
  let rotationMode = $state<VizRotationMode>(getVizRotationMode());
  /** Single view orientation (Blender-style); orbit method only changes mouse mapping. */
  let quat = $state<Quat>([...DEFAULT_QUAT] as Quat);
  /** 4D view←world; rebuilt from angles4, tip-drag may override until next angle change. */
  let rot4 = $state<Mat4>(mat4FromAngles4(DEFAULT_ANGLES4));
  let snapRaf = 0;
  /** Shift+drag on the main canvas orbits xw/yw when in 4D. */
  let orbitShift = false;

  function setAngles4(next: Angles4) {
    angles4 = next;
    rot4 = mat4FromAngles4(next);
  }

  function orbitAngles4(dx: number, dy: number, shift: boolean, k = 0.01) {
    if (shift) {
      setAngles4({
        ...angles4,
        xw: angles4.xw + dx * k,
        yw: angles4.yw - dy * k,
      });
    } else {
      setAngles4({
        ...angles4,
        xz: angles4.xz + dx * k,
        yz: angles4.yz - dy * k,
      });
    }
  }

  // Keep rot4 in sync when parent/sliders change angles4.
  $effect(() => {
    rot4 = mat4FromAngles4(angles4);
  });
  const MIN_ZOOM = 0.2;
  const OBJECTIVE_LEVEL_BOUNDS_EXTENSION = 0.2;
  type SelectionKey = { type: 'point' | 'line' | 'region'; id: string };
  type SelectedItem =
    | { type: 'point'; item: ScenePoint }
    | { type: 'line'; item: SceneLine }
    | { type: 'region'; item: SceneRegion };
  let hoveredKey = $state<SelectionKey | null>(null);
  let selectedKey = $state<SelectionKey | null>(null);
  let legendOpen = $state(false);
  type CoordinateTooltip = {
    screenX: number;
    screenY: number;
    values: { name: string; value: number; highlight?: boolean }[];
    label?: string;
  };
  let coordinateTooltip = $state<CoordinateTooltip | null>(null);
  let coordinateTooltipEl: HTMLDivElement | undefined = $state();

  type DragMode = 'rotate' | 'pan' | null;
  let dragMode: DragMode = null;
  let lastX = 0;
  let lastY = 0;
  let dragMoved = false;
  let activePointerId: number | null = null;
  let pinchDist0: number | null = null;
  let pinchZoom0 = 1;
  const pointers = new SvelteMap<number, { x: number; y: number }>();

  const frame = $derived(
    scene.frames[Math.min(stepIndex, Math.max(0, scene.frames.length - 1))] ?? null,
  );

  const objectiveLevels = $derived.by(() => {
    if (scene.mode !== 'exact2d' || objectiveCoefficients.length < 2) return [];
    const ax = scene.axisX;
    const ay = scene.axisY;
    const a = objectiveCoefficients[ax] ?? 0;
    const b = objectiveCoefficients[ay] ?? 0;
    if (Math.hypot(a, b) < 1e-9) return [];
    const x0 = scene.bounds.min[ax] ?? 0;
    const x1 = scene.bounds.max[ax] ?? 1;
    const y0 = scene.bounds.min[ay] ?? 0;
    const y1 = scene.bounds.max[ay] ?? 1;
    const xCenter = (x0 + x1) / 2;
    const yCenter = (y0 + y1) / 2;
    const maxZoomOutXRange = (x1 - x0) / MIN_ZOOM;
    const maxZoomOutYRange = (y1 - y0) / MIN_ZOOM;
    const xExtension = maxZoomOutXRange * OBJECTIVE_LEVEL_BOUNDS_EXTENSION;
    const yExtension = maxZoomOutYRange * OBJECTIVE_LEVEL_BOUNDS_EXTENSION;
    const clipX0 = xCenter - maxZoomOutXRange / 2 - xExtension;
    const clipX1 = xCenter + maxZoomOutXRange / 2 + xExtension;
    const clipY0 = yCenter - maxZoomOutYRange / 2 - yExtension;
    const clipY1 = yCenter + maxZoomOutYRange / 2 + yExtension;
    const baseValues = [a * x0 + b * y0, a * x0 + b * y1, a * x1 + b * y0, a * x1 + b * y1];
    const lo = Math.min(...baseValues);
    const hi = Math.max(...baseValues);
    if (hi - lo < 1e-9) return [];
    const step = (hi - lo) / 8;
    const clipValues = [
      a * clipX0 + b * clipY0,
      a * clipX0 + b * clipY1,
      a * clipX1 + b * clipY0,
      a * clipX1 + b * clipY1,
    ];
    const clipLo = Math.min(...clipValues);
    const clipHi = Math.max(...clipValues);
    const iMin = Math.ceil((clipLo - lo) / step - 1e-9);
    const iMax = Math.floor((clipHi - lo) / step + 1e-9);
    const levels: number[] = [];
    for (let i = iMin; i <= iMax; i++) {
      if (i === 0 || i === 8) continue;
      levels.push(lo + i * step);
      if (levels.length >= 80) break;
    }
    return levels
      .map((level, i) => ({
        id: `objective-level-${i}`,
        points: clipLevelLine(a, b, level, clipX0, clipX1, clipY0, clipY1),
        kind: 'level' as const,
        label: t('vizObjectiveLevels'),
        color: '#7f77dd',
        dash: true,
      }))
      .filter((line) => line.points.length === 2);
  });

  const activeKey = $derived(hoveredKey ?? selectedKey);
  const selectedItem = $derived.by((): SelectedItem | null => {
    if (!frame || !activeKey) return null;
    if (activeKey.type === 'point') {
      const item = frame.points.find((point) => point.id === activeKey.id);
      return item ? { type: 'point', item } : null;
    }
    if (activeKey.type === 'line') {
      const item = [...frame.lines, ...objectiveLevels].find((line) => line.id === activeKey.id);
      return item ? { type: 'line', item } : null;
    }
    const item = frame.regions.find((region) => region.id === activeKey.id);
    return item ? { type: 'region', item } : null;
  });

  type LegendItem = {
    id: string;
    marker: 'point' | 'line' | 'region';
    label: string;
    color: string;
    opacity: number;
  };
  const legendItems = $derived.by(() => {
    if (!frame) return [] as LegendItem[];
    const items = new SvelteMap<string, LegendItem>();
    for (const region of frame.regions) {
      const id = `region:${region.kind}:${region.color ?? ''}`;
      if (!items.has(id)) {
        items.set(id, {
          id,
          marker: 'region',
          label: region.label ?? kindLabel(region.kind),
          color: region.color ?? '#2563eb',
          opacity: region.opacity ?? 0.2,
        });
      }
    }
    for (const face of frame.faces ?? []) {
      const id = `face:${face.kind}:${face.color ?? ''}`;
      if (!items.has(id)) {
        items.set(id, {
          id,
          marker: 'region',
          label: face.label ?? kindLabel(face.kind),
          color: face.color ?? '#2563eb',
          opacity: face.opacity ?? 0.2,
        });
      }
    }
    for (const line of [...frame.lines, ...objectiveLevels]) {
      const id = `line:${line.kind}:${line.color ?? ''}`;
      if (!items.has(id)) {
        items.set(id, {
          id,
          marker: 'line',
          label: line.label ?? kindLabel(line.kind),
          color: line.color ?? '#737373',
          opacity: 1,
        });
      }
    }
    for (const point of frame.points) {
      const id = `point:${point.kind}:${point.color ?? ''}`;
      if (!items.has(id)) {
        items.set(id, {
          id,
          marker: 'point',
          label: point.label ?? pointKindLabel(point.kind),
          color: point.color ?? '#333333',
          opacity: 1,
        });
      }
    }
    return [...items.values()];
  });

  const is4dMode = $derived(scene.mode === 'project4d' && scene.dim >= 4);
  const is3dMode = $derived(
    scene.mode === 'exact3d' ||
      scene.mode === 'section3d' ||
      scene.mode === 'project4d' ||
      (scene.mode === 'selectedAxes' && scene.dim >= 3),
  );

  /**
   * Stable 3D normalize fit from frame geometry only.
   * Must not include the point being projected (e.g. axis tips past bounds),
   * otherwise each call gets a different center/scale and axes skew vs edges.
   */
  const fit3d = $derived.by(() => {
    const mode = scene.mode;
    if (mode !== 'exact3d' && mode !== 'section3d' && mode !== 'selectedAxes') {
      return null;
    }
    // Must match adapter faces (axisX/Y/Z) — never hard-code [0,1,2] for exact3d.
    const axes = sceneDisplayAxes(scene);
    const toSel = (coords: number[]) => {
      const s = selectAxes(coords, axes);
      while (s.length < 3) s.push(0);
      return s;
    };
    const pool: number[][] = [];
    if (frame) {
      for (const p of frame.points) pool.push(toSel(p.coords));
      for (const face of frame.faces ?? []) {
        for (const pt of face.points) pool.push(toSel(pt));
      }
      for (const line of frame.lines) {
        for (const pt of line.points) pool.push(toSel(pt));
      }
    }
    if (pool.length === 0) {
      const fallback = axes.map((ai) => {
        const mn = scene.bounds.min[ai] ?? 0;
        const mx = scene.bounds.max[ai] ?? 1;
        return (mn + mx) / 2;
      });
      while (fallback.length < 3) fallback.push(0);
      return boundingCenterScale([fallback], 1);
    }
    return boundingCenterScale(pool, 1);
  });

  /** Stable 4D normalize fit from frame geometry (points + faces + edges). */
  const fit4d = $derived.by(() => {
    if (scene.mode !== 'project4d' || scene.dim < 4) return null;
    const pool: number[][] = [];
    if (frame) {
      for (const p of frame.points) pool.push(p.coords.slice(0, 4));
      for (const face of frame.faces ?? []) {
        for (const pt of face.points) pool.push(pt.slice(0, 4));
      }
      for (const line of frame.lines) {
        for (const pt of line.points) pool.push(pt.slice(0, 4));
      }
    }
    if (pool.length === 0) {
      const fallback = scene.bounds.min.slice(0, 4).map((mn, i) => {
        const mx = scene.bounds.max[i] ?? mn + 1;
        return (mn + mx) / 2;
      });
      while (fallback.length < 4) fallback.push(0);
      return boundingCenterScale([fallback], 1);
    }
    return boundingCenterScale(pool, 1);
  });

  const pca = $derived.by(() => {
    if (scene.mode !== 'pca') return null;
    const pool = scene.frames.flatMap((f) => f.points.map((p) => p.coords));
    if (pool.length === 0) return null;
    return { mean: meanVec(pool), basis: computePcaBasis(pool, 2) };
  });

  function kindLabel(kind: string): string {
    switch (kind) {
      case 'feasible':
        return t('vizKindFeasible');
      case 'infeasible':
        return t('vizKindInfeasible');
      case 'best':
        return t('vizKindBest');
      case 'bestEver':
        return t('vizKindBestEver');
      case 'trajectory':
        return t('vizKindTrajectory');
      case 'optimum':
        return t('vizKindOptimum');
      case 'baseline':
        return t('vizKindBaseline');
      case 'vertex':
        return t('vizKindVertex');
      case 'compare':
        return t('vizKindCompare');
      case 'constraint':
        return t('vizKindConstraint');
      case 'edge':
        return t('vizKindEdge');
      case 'axis':
        return t('vizKindAxis');
      case 'level':
        return t('vizObjectiveLevels');
      default:
        return kind;
    }
  }

  function pointKindLabel(kind: string): string {
    return kind === 'feasible' ? t('vizKindFeasiblePoint') : kindLabel(kind);
  }

  function metaLabel(key: string): string {
    if (key === 'rawFitness') return t('vizRawFitness');
    return key;
  }

  function clipLevelLine(
    a: number,
    b: number,
    level: number,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
  ): number[][] {
    const candidates: number[][] = [];
    const addPoint = (x: number, y: number) => {
      if (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        x >= x0 - 1e-9 &&
        x <= x1 + 1e-9 &&
        y >= y0 - 1e-9 &&
        y <= y1 + 1e-9 &&
        !candidates.some((p) => Math.hypot(p[0] - x, p[1] - y) < 1e-7)
      ) {
        const coords = new Array(scene.dim).fill(0);
        coords[scene.axisX] = x;
        coords[scene.axisY] = y;
        candidates.push(coords);
      }
    };
    if (Math.abs(b) > 1e-9) {
      addPoint(x0, (level - a * x0) / b);
      addPoint(x1, (level - a * x1) / b);
    }
    if (Math.abs(a) > 1e-9) {
      addPoint((level - b * y0) / a, y0);
      addPoint((level - b * y1) / a, y1);
    }
    return candidates.slice(0, 2);
  }

  function cancelSnapAnim() {
    if (snapRaf) {
      cancelAnimationFrame(snapRaf);
      snapRaf = 0;
    }
  }

  function resetView() {
    cancelSnapAnim();
    quat = [...DEFAULT_QUAT] as Quat;
    setAngles4({ ...DEFAULT_ANGLES4 });
    zoom = 1;
    panX = 0;
    panY = 0;
    hoveredKey = null;
    coordinateTooltip = null;
  }

  function onGizmoInteract() {
    autoRotate = false;
    cancelSnapAnim();
  }

  function setRotationMode(mode: VizRotationMode) {
    // Preference only — must not alter current orientation (Blender Orbit Method).
    rotationMode = mode;
    setVizRotationMode(mode);
  }

  function animateQuatTo(target: Quat) {
    cancelSnapAnim();
    const from = quat;
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / SNAP_MS);
      const eased = 1 - (1 - u) * (1 - u);
      quat = quatSlerp(from, target, eased);
      if (u < 1) snapRaf = requestAnimationFrame(step);
      else snapRaf = 0;
    };
    snapRaf = requestAnimationFrame(step);
  }

  function onGizmoSnap(target: Quat) {
    autoRotate = false;
    animateQuatTo(target);
  }

  function syncCanvasSize() {
    const wrap = wrapEl;
    const canvas = canvasEl;
    if (!wrap || !canvas) return;
    const rect = wrap.getBoundingClientRect();
    const nextW = Math.max(1, Math.round(rect.width));
    const nextH = Math.max(1, Math.round(rect.height));
    const nextDpr = Math.min(2.5, window.devicePixelRatio || 1);
    cssW = nextW;
    cssH = nextH;
    dpr = nextDpr;
    const bw = Math.round(nextW * nextDpr);
    const bh = Math.round(nextH * nextDpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
  }

  $effect(() => {
    const wrap = wrapEl;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    syncCanvasSize();
    const ro = new ResizeObserver(() => syncCanvasSize());
    ro.observe(wrap);
    const onResize = () => syncCanvasSize();
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  });

  function selectedAxesIndices(): number[] {
    return sceneDisplayAxes(scene);
  }

  function applyViewRotation(p3: number[]): number[] {
    return rotateByQuat(p3, quat);
  }

  function toScreenCoords(coords: number[]): {
    x: number;
    y: number;
    depth: number;
  } {
    const W = cssW;
    const H = cssH;
    const cx = W / 2 + panX;
    const cy = H / 2 + panY;
    const scale2d = Math.min(W, H) * 0.5 * zoom;
    const mode = scene.mode;
    const dim = scene.dim;

    if (mode === 'exact2d' || (mode === 'selectedAxes' && dim <= 2)) {
      const x = coords[scene.axisX] ?? 0;
      const y = coords[scene.axisY] ?? 0;
      const { min, max } = scene.bounds;
      const plotW = W;
      const plotH = H;
      const sx =
        panX +
        ((x - min[scene.axisX]) / Math.max(1e-9, max[scene.axisX] - min[scene.axisX])) *
          plotW *
          zoom +
        (plotW * (1 - zoom)) / 2;
      const sy =
        H +
        panY -
        ((y - min[scene.axisY]) / Math.max(1e-9, max[scene.axisY] - min[scene.axisY])) *
          plotH *
          zoom -
        (plotH * (1 - zoom)) / 2;
      return { x: sx, y: sy, depth: 0 };
    }

    if (mode === 'pca' && pca) {
      const proj = projectPca(coords, pca.basis, pca.mean);
      const raw = scene.frames.flatMap((f) =>
        f.points.map((p) => projectPca(p.coords, pca.basis, pca.mean)),
      );
      const { center, scale } = boundingCenterScale(raw.length ? raw : [proj], 1);
      const n = normalizePoint(proj, center, scale);
      return {
        x: cx + n[0] * scale2d,
        y: cy - (n[1] ?? 0) * scale2d,
        depth: 0,
      };
    }

    if (mode === 'parallel') {
      return { x: cx, y: cy, depth: 0 };
    }

    let p3: number[];
    if (mode === 'project4d' && dim >= 4) {
      const p4 = coords.slice(0, 4);
      while (p4.length < 4) p4.push(0);
      const fit = fit4d ?? boundingCenterScale([p4], 1);
      const n = normalizePoint(p4, fit.center, fit.scale);
      const r = mat4Apply(rot4, n);
      p3 = project4to3(r, 3.4);
    } else if (mode === 'exact3d' || mode === 'section3d' || mode === 'selectedAxes') {
      const axes = selectedAxesIndices();
      const selected = selectAxes(coords, axes);
      while (selected.length < 3) selected.push(0);
      const fit = fit3d ?? boundingCenterScale([selected], 1);
      const n = normalizePoint(selected, fit.center, fit.scale);
      p3 = applyViewRotation(n);
    } else {
      p3 = [coords[0] ?? 0, coords[1] ?? 0, coords[2] ?? 0];
    }
    // 3D: true orthographic after quat. 4D path keeps perspective on the 3-slice.
    if (mode === 'project4d') {
      return project3to2(p3, 3.4, scale2d, cx, cy);
    }
    return projectViewOrtho(p3, scale2d, cx, cy);
  }

  function sceneCenter3(): number[] {
    const axes = selectedAxesIndices();
    return axes.map((ai) => {
      const mn = scene.bounds.min[ai] ?? 0;
      const mx = scene.bounds.max[ai] ?? 1;
      return (mn + mx) / 2;
    });
  }

  $effect(() => {
    if (!autoRotate) return;
    cancelSnapAnim();
    let raf = 0;
    // Local accumulators — avoid stale closure over $state.
    let a4 = { ...angles4 };
    const loop = () => {
      if (is4dMode) {
        a4 = {
          ...a4,
          xw: a4.xw + 0.006,
          yw: a4.yw + 0.004,
          xz: a4.xz + 0.003,
        };
        setAngles4(a4);
      } else {
        // Auto-spin around world Z (same yaw as turntable).
        quat = applyTurntableOrbit(quat, 1, 0, 0.008);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  $effect(() => {
    const lookFrom = rotateByQuat(VIEW_TOWARD_CAMERA, quatConjugate(quat));
    const axisW = {
      x: mat4Col(rot4, 0)[3] ?? 0,
      y: mat4Col(rot4, 1)[3] ?? 0,
      z: mat4Col(rot4, 2)[3] ?? 0,
      w: mat4Col(rot4, 3)[3] ?? 0,
    };
    viewDebug = {
      quat: [quat[0], quat[1], quat[2], quat[3]],
      lookFrom: [lookFrom[0] ?? 0, lookFrom[1] ?? 0, lookFrom[2] ?? 0],
      rotationMode,
      zoom,
      panX,
      panY,
      angles4: { ...angles4 },
      rot4: is4dMode ? [...rot4] : undefined,
      axisW: is4dMode ? axisW : undefined,
      projection: is4dMode ? 'perspective4d' : 'viewOrtho',
    };
  });

  $effect(() => {
    const canvas = canvasEl;
    if (!canvas || !frame) return;
    // Depend on view + size so redraw stays crisp.
    void cssW;
    void cssH;
    void dpr;
    void zoom;
    void panX;
    void panY;
    void rot4;
    void quat;
    void stepIndex;
    void scene;
    void activeKey;
    void objectiveLevels;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = cssW;
    const H = cssH;
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= W; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
      ctx.stroke();
    }
    for (let gy = 0; gy <= H; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
    }

    if (scene.mode === 'parallel') {
      drawParallel(ctx, W, H);
      return;
    }

    for (const region of frame.regions) {
      if (region.points2d.length < 3) continue;
      ctx.beginPath();
      region.points2d.forEach((pt, i) => {
        const coords = new Array(scene.dim).fill(0);
        coords[scene.axisX] = pt[0];
        coords[scene.axisY] = pt[1];
        const s = toScreenCoords(coords);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fillStyle = region.color
        ? hexToRgba(region.color, region.opacity ?? 0.12)
        : 'rgba(37,99,235,0.12)';
      ctx.fill();
      ctx.strokeStyle = region.color ?? '#2563eb';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.45;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const faceData = (frame.faces ?? []).map((face) => {
      const proj = face.points.map((p) => toScreenCoords(p));
      const depth = proj.reduce((s, p) => s + p.depth, 0) / Math.max(1, proj.length);
      return { face, proj, depth };
    });
    faceData.sort((a, b) => a.depth - b.depth);
    for (const { face, proj } of faceData) {
      if (proj.length < 3) continue;
      ctx.beginPath();
      proj.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = face.color
        ? hexToRgba(face.color, face.opacity ?? 0.14)
        : 'rgba(37,99,235,0.14)';
      ctx.fill();
      ctx.strokeStyle = face.color ?? '#2563eb';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (is3dMode) {
      drawAxes3d(ctx);
    }

    const lineData = [...frame.lines, ...objectiveLevels].map((line) => {
      const proj = line.points.map((p) => toScreenCoords(p));
      const depth = proj.reduce((s, p) => s + p.depth, 0) / Math.max(1, proj.length);
      return { line, proj, depth };
    });
    lineData.sort((a, b) => a.depth - b.depth);
    for (const { line, proj } of lineData) {
      if (proj.length < 2) continue;
      ctx.beginPath();
      proj.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.strokeStyle = line.color ?? '#737373';
      const highlighted = activeKey?.type === 'line' && activeKey.id === line.id;
      ctx.lineWidth = highlighted ? 4 : line.kind === 'trajectory' ? 2.2 : 1.4;
      ctx.globalAlpha = highlighted ? 1 : line.kind === 'level' ? 0.58 : 1;
      if (line.dash || line.kind === 'level') ctx.setLineDash([5, 4]);
      else ctx.setLineDash([]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    const pts = frame.points
      .map((p) => ({ p, s: toScreenCoords(p.coords) }))
      .sort((a, b) => a.s.depth - b.s.depth);
    for (const { p, s } of pts) {
      ctx.beginPath();
      ctx.fillStyle = p.color ?? '#333';
      ctx.arc(s.x, s.y, p.size ?? 4, 0, Math.PI * 2);
      ctx.fill();
      if (activeKey?.type === 'point' && activeKey.id === p.id) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, (p.size ?? 4) + 4, 0, Math.PI * 2);
        ctx.strokeStyle = p.color ?? '#333';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      if (p.kind === 'best' || p.kind === 'baseline' || p.kind === 'bestEver') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    ctx.fillStyle = '#525252';
    ctx.font = '12px IBM Plex Mono, ui-monospace, monospace';
    const xName = scene.productNames[scene.axisX] ?? `x${scene.axisX + 1}`;
    const yName = scene.productNames[scene.axisY] ?? `x${scene.axisY + 1}`;
    ctx.fillText(xName, W - 12 - ctx.measureText(xName).width, H - 12);
    ctx.fillText(yName, 12, 18);
  });

  function drawAxes3d(ctx: CanvasRenderingContext2D) {
    const axes = selectedAxesIndices();
    const origin = new Array(scene.dim).fill(0);
    const colors = ['#ef4444', '#22c55e', '#3b82f6'];
    const o = toScreenCoords(origin);
    axes.forEach((ai, i) => {
      const tip = origin.slice();
      const span = Math.max(1e-6, (scene.bounds.max[ai] ?? 1) - (scene.bounds.min[ai] ?? 0));
      tip[ai] = (scene.bounds.max[ai] ?? 1) + span * 0.08;
      const tipScreen = toScreenCoords(tip);
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(tipScreen.x, tipScreen.y);
      ctx.strokeStyle = colors[i] ?? '#737373';
      ctx.lineWidth = 1.8;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
      const label = scene.productNames[ai] ?? `x${ai + 1}`;
      ctx.fillStyle = colors[i] ?? '#525252';
      ctx.font = '11px IBM Plex Mono, ui-monospace, monospace';
      ctx.fillText(label, tipScreen.x + 6, tipScreen.y - 4);
    });
  }

  function drawParallel(ctx: CanvasRenderingContext2D, W: number, H: number) {
    if (!frame) return;
    const n = scene.dim;
    const pad = 40;
    const span = (W - pad * 2) * zoom;
    const x0 = pad + panX + ((W - pad * 2) * (1 - zoom)) / 2;
    ctx.strokeStyle = '#d4d4d4';
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const x = x0 + (i / Math.max(1, n - 1)) * span;
      ctx.beginPath();
      ctx.moveTo(x, pad + panY);
      ctx.lineTo(x, H - pad + panY);
      ctx.stroke();
      ctx.fillStyle = '#525252';
      ctx.font = '10px IBM Plex Mono, monospace';
      const label = scene.productNames[i] ?? `x${i + 1}`;
      ctx.fillText(label.slice(0, 10), x - 20, H - 18 + panY);
    }
    for (const p of frame.points) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = x0 + (i / Math.max(1, n - 1)) * span;
        const mn = scene.bounds.min[i];
        const mx = scene.bounds.max[i];
        const t = (p.coords[i] - mn) / Math.max(1e-9, mx - mn);
        const y = H - pad + panY - t * (H - pad * 2) * zoom;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = p.color ?? '#3B82F6';
      ctx.globalAlpha = p.kind === 'best' || p.kind === 'bestEver' ? 0.95 : 0.25;
      ctx.lineWidth = p.kind === 'best' || p.kind === 'bestEver' ? 2 : 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function hexToRgba(hex: string, a: number): string {
    const h = hex.replace('#', '');
    const full =
      h.length === 3
        ? h
            .split('')
            .map((c) => c + c)
            .join('')
        : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  function clientToLocal(e: { clientX: number; clientY: number }) {
    const rect = canvasEl!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * cssW,
      y: ((e.clientY - rect.top) / rect.height) * cssH,
    };
  }

  function pointToSegmentDistance(
    x: number,
    y: number,
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    if (length2 < 1e-9) return Math.hypot(x - a.x, y - a.y);
    const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length2));
    return Math.hypot(x - (a.x + u * dx), y - (a.y + u * dy));
  }

  function hitTest(local: { x: number; y: number }): SelectionKey | null {
    if (!frame || scene.mode === 'parallel') return null;
    let pointHit: SelectionKey | null = null;
    let pointDistance = 13;
    for (const point of frame.points) {
      const screen = toScreenCoords(point.coords);
      const distance = Math.hypot(screen.x - local.x, screen.y - local.y);
      if (distance < pointDistance) {
        pointDistance = distance;
        pointHit = { type: 'point', id: point.id };
      }
    }
    if (pointHit) return pointHit;

    let lineHit: SelectionKey | null = null;
    let lineDistance = 8;
    for (const line of frame.lines) {
      if (line.kind === 'level') continue;
      const projected = line.points.map(toScreenCoords);
      for (let i = 1; i < projected.length; i++) {
        const distance = pointToSegmentDistance(local.x, local.y, projected[i - 1], projected[i]);
        if (distance < lineDistance) {
          lineDistance = distance;
          lineHit = { type: 'line', id: line.id };
        }
      }
    }
    if (lineHit) return lineHit;
    return null;
  }

  function formatValue(value: unknown): string {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? Number(value.toFixed(4)).toString() : '—';
    }
    if (typeof value === 'boolean') return value ? '✓' : '—';
    return String(value);
  }

  function applyZoom(factor: number) {
    zoom = Math.min(8, Math.max(MIN_ZOOM, zoom * factor));
  }

  function updateCoordinateTooltip(local: { x: number; y: number }, hit: SelectionKey | null) {
    if (!frame) {
      coordinateTooltip = null;
      return;
    }

    if (scene.mode === 'exact2d') {
      const point =
        hit?.type === 'point' ? frame.points.find((item) => item.id === hit.id) : undefined;
      if (point) {
        coordinateTooltip = {
          screenX: local.x,
          screenY: local.y,
          values: pointTooltipCoords(point.coords, scene.productNames, [scene.axisX, scene.axisY]),
          label: point.label ?? pointKindLabel(point.kind),
        };
        return;
      }

      const plotW = cssW;
      const plotH = cssH;
      const originX = panX + (plotW * (1 - zoom)) / 2;
      const originY = cssH + panY - (plotH * (1 - zoom)) / 2;
      const tx = (local.x - originX) / Math.max(1e-9, plotW * zoom);
      const ty = (originY - local.y) / Math.max(1e-9, plotH * zoom);
      const minX = scene.bounds.min[scene.axisX] ?? 0;
      const maxX = scene.bounds.max[scene.axisX] ?? minX + 1;
      const minY = scene.bounds.min[scene.axisY] ?? 0;
      const maxY = scene.bounds.max[scene.axisY] ?? minY + 1;
      const names = scene.productNames;
      coordinateTooltip = {
        screenX: local.x,
        screenY: local.y,
        values: [
          {
            name: names[scene.axisX] ?? `x${scene.axisX + 1}`,
            value: minX + tx * (maxX - minX),
            highlight: true,
          },
          {
            name: names[scene.axisY] ?? `x${scene.axisY + 1}`,
            value: minY + ty * (maxY - minY),
            highlight: true,
          },
        ],
      };
      return;
    }

    if (!is3dMode) {
      coordinateTooltip = null;
      return;
    }

    const axes = selectedAxesIndices();
    const point =
      hit?.type === 'point' ? frame.points.find((item) => item.id === hit.id) : undefined;
    if (point) {
      coordinateTooltip = {
        screenX: local.x,
        screenY: local.y,
        values: pointTooltipCoords(point.coords, scene.productNames, axes),
        label: point.label ?? pointKindLabel(point.kind),
      };
      return;
    }

    // Empty-space: intersect view Z=0 plane through scene center (display axes only).
    const cx = cssW / 2 + panX;
    const cy = cssH / 2 + panY;
    const scale2d = Math.min(cssW, cssH) * 0.5 * zoom;
    const nx = (local.x - cx) / Math.max(1e-9, scale2d);
    const ny = (cy - local.y) / Math.max(1e-9, scale2d);
    const camPoint = unprojectViewOrthoZ0(nx, ny);
    // Inverse rotation to normalized model space.
    const modelN = rotateByQuat(camPoint, quatConjugate(quat));
    const fit =
      fit3d ??
      (() => {
        const c = sceneCenter3();
        while (c.length < 3) c.push(0);
        return boundingCenterScale([c], 1);
      })();
    const modelSelected = modelN.map((v, i) => v / fit.scale + (fit.center[i] ?? 0));
    const values: CoordinateTooltip['values'] = axes.map((ai, i) => ({
      name: scene.productNames[ai] ?? `x${ai + 1}`,
      value: modelSelected[i] ?? 0,
      highlight: true,
    }));
    if (
      scene.mode === 'section3d' &&
      scene.sectionAxis != null &&
      !axes.includes(scene.sectionAxis)
    ) {
      values.push({
        name: scene.productNames[scene.sectionAxis] ?? `x${scene.sectionAxis + 1}`,
        value: scene.sectionValue ?? 0,
        highlight: false,
      });
    }
    coordinateTooltip = {
      screenX: local.x,
      screenY: local.y,
      values,
    };
  }

  function coordinateTooltipStyle(tooltip: CoordinateTooltip): string {
    const width = coordinateTooltipEl?.offsetWidth ?? 220;
    const height = coordinateTooltipEl?.offsetHeight ?? 58;
    const preferredLeft =
      tooltip.screenX + 12 + width <= cssW - 8
        ? tooltip.screenX + 12
        : tooltip.screenX - width - 12;
    const preferredTop =
      tooltip.screenY + 12 + height <= cssH - 8
        ? tooltip.screenY + 12
        : tooltip.screenY - height - 12;
    const left = Math.max(8, Math.min(cssW - width - 8, preferredLeft));
    const top = Math.max(8, Math.min(cssH - height - 8, preferredTop));
    return `left:${left}px;top:${top}px;`;
  }

  function onPointerDown(e: PointerEvent) {
    if (!canvasEl) return;
    coordinateTooltip = null;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvasEl.setPointerCapture(e.pointerId);

    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchDist0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchZoom0 = zoom;
      dragMode = null;
      cursor = 'grab';
      return;
    }

    autoRotate = false;
    cancelSnapAnim();
    activePointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    dragMoved = false;
    // 4D: Shift+LMB orbits xw/yw (not pan). Pan via Alt / MMB / RMB.
    const pan = is4dMode
      ? e.button === 1 || e.button === 2 || e.altKey
      : e.button === 1 || e.button === 2 || e.altKey || e.shiftKey || !is3dMode;
    orbitShift = is4dMode && e.shiftKey && !pan;
    dragMode = pan ? 'pan' : 'rotate';
    cursor = 'grabbing';
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) {
      if (canvasEl) {
        const local = clientToLocal(e);
        hoveredKey = hitTest(local);
        updateCoordinateTooltip(local, hoveredKey);
        cursor = hoveredKey ? 'pointer' : 'grab';
      }
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2 && pinchDist0 != null) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (dist > 1) zoom = Math.min(8, Math.max(MIN_ZOOM, pinchZoom0 * (dist / pinchDist0)));
      return;
    }

    if (activePointerId !== e.pointerId || !dragMode) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;

    if (dragMode === 'pan') {
      panX += dx;
      panY += dy;
      return;
    }

    cancelSnapAnim();
    if (is4dMode) {
      orbitAngles4(dx, dy, orbitShift || e.shiftKey);
      return;
    }
    if (rotationMode === 'trackball') {
      const lastLocal = {
        x:
          ((lastX - dx - (canvasEl?.getBoundingClientRect().left ?? 0)) /
            Math.max(1, canvasEl?.getBoundingClientRect().width ?? 1)) *
          cssW,
        y:
          ((lastY - dy - (canvasEl?.getBoundingClientRect().top ?? 0)) /
            Math.max(1, canvasEl?.getBoundingClientRect().height ?? 1)) *
          cssH,
      };
      const nextLocal = clientToLocal(e);
      const delta = arcballDelta(lastLocal, nextLocal, cssW, cssH);
      quat = applyTrackballOrbit(quat, delta);
      return;
    }

    quat = applyTurntableOrbit(quat, dx, dy, 0.01);
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      pinchDist0 = null;
    }
    if (activePointerId === e.pointerId) {
      activePointerId = null;
      dragMode = null;
      cursor = 'grab';
    }
    try {
      canvasEl?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    cancelSnapAnim();
    applyZoom(e.deltaY > 0 ? 0.9 : 1.1);
  }

  function onDblClick() {
    resetView();
  }

  function onClick(e: MouseEvent) {
    if (!frame || !canvasEl || dragMoved) return;
    selectedKey = hitTest(clientToLocal(e));
    hoveredKey = null;
    if (selectedKey?.type === 'point') {
      const point = frame.points.find((item) => item.id === selectedKey?.id);
      if (point) onPointClick?.(point);
    }
  }
</script>

<div class="flex w-full flex-col gap-2{fill ? ' h-full min-h-0' : ''}">
  <div
    bind:this={wrapEl}
    class="relative w-full overflow-hidden rounded-[8px] border border-border bg-bg-soft {plotClass}"
  >
    <canvas
      bind:this={canvasEl}
      class="block h-full w-full touch-none"
      style:cursor
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerleave={() => {
        if (pointers.size === 0) {
          hoveredKey = null;
          coordinateTooltip = null;
        }
      }}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onwheel={onWheel}
      ondblclick={onDblClick}
      onclick={onClick}
      oncontextmenu={(e) => e.preventDefault()}
      aria-label={t('geometryTitle')}
    ></canvas>
    <div class="pointer-events-none absolute inset-0 z-10">
      <div class="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5">
        <button
          type="button"
          class="pointer-events-auto rounded-md border border-border bg-bg/95 px-2 py-1 text-[11px] text-text shadow-sm hover:bg-bg"
          title={t('vizResetView')}
          aria-label={t('vizResetView')}
          onclick={(e) => {
            e.stopPropagation();
            resetView();
          }}
        >
          {t('vizResetView')}
        </button>
        {#if is3dMode && !is4dMode}
          <div
            class="pointer-events-auto flex overflow-hidden rounded-md border border-border bg-bg/95 text-[11px] shadow-sm"
            role="group"
            aria-label={t('vizRotationMode')}
          >
            <button
              type="button"
              class="px-2 py-1 {rotationMode === 'turntable'
                ? 'bg-brand text-white'
                : 'text-text-muted hover:bg-bg-soft'}"
              title={t('vizRotationTurntableTitle')}
              aria-pressed={rotationMode === 'turntable'}
              onclick={(e) => {
                e.stopPropagation();
                setRotationMode('turntable');
              }}
            >
              {t('vizRotationTurntable')}
            </button>
            <button
              type="button"
              class="px-2 py-1 {rotationMode === 'trackball'
                ? 'bg-brand text-white'
                : 'text-text-muted hover:bg-bg-soft'}"
              title={t('vizRotationTrackballTitle')}
              aria-pressed={rotationMode === 'trackball'}
              onclick={(e) => {
                e.stopPropagation();
                setRotationMode('trackball');
              }}
            >
              {t('vizRotationTrackball')}
            </button>
          </div>
        {/if}
      </div>
      {#if is4dMode}
        <ViewGizmo
          {quat}
          size={120}
          mode="4d"
          bind:rot4
          onSnap={onGizmoSnap}
          onInteract={onGizmoInteract}
          onOrbit4={(dx, dy, shift) => {
            onGizmoInteract();
            orbitAngles4(dx, dy, shift);
          }}
        />
      {:else if is3dMode}
        <ViewGizmo {quat} size={120} onSnap={onGizmoSnap} onInteract={onGizmoInteract} />
      {/if}
      <div
        class="pointer-events-none absolute bottom-2 left-2 flex max-w-[min(100%-1rem,22rem)] flex-col items-start gap-1.5"
      >
        <button
          type="button"
          class="pointer-events-auto rounded-md border border-border bg-bg/95 px-2 py-1 text-[11px] text-text shadow-sm hover:bg-bg"
          aria-expanded={legendOpen}
          aria-controls="viz-legend-panel"
          onclick={(e) => {
            e.stopPropagation();
            legendOpen = !legendOpen;
          }}
        >
          {legendOpen ? t('vizLegendHide') : t('vizLegend')}
        </button>
        {#if legendOpen}
          <div
            id="viz-legend-panel"
            class="pointer-events-auto max-h-[min(40vh,14rem)] overflow-y-auto rounded-[8px] border border-border bg-bg/95 p-2.5 shadow-sm"
            role="region"
            aria-label={t('vizLegend')}
          >
            {#if legendItems.length > 0}
              <ul class="flex flex-col gap-1.5 text-xs text-text-muted">
                {#each legendItems as item (item.id)}
                  <li class="flex items-center gap-1.5">
                    {#if item.marker === 'point'}
                      <span
                        class="size-2.5 shrink-0 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
                        style:background-color={item.color}
                        style:opacity={item.opacity}
                      ></span>
                    {:else if item.marker === 'line'}
                      <span
                        class="h-0.5 w-5 shrink-0 rounded"
                        style:background-color={item.color}
                        style:opacity={item.opacity}
                      ></span>
                    {:else}
                      <span
                        class="h-2.5 w-4 shrink-0 rounded-sm border"
                        style:background-color={item.color}
                        style:border-color={item.color}
                        style:opacity={Math.max(0.35, item.opacity)}
                      ></span>
                    {/if}
                    <span>{item.label}</span>
                  </li>
                {/each}
              </ul>
            {/if}
            <p
              class="text-[11px] text-text-muted {legendItems.length > 0
                ? 'mt-2 border-t border-border-soft pt-2'
                : ''}"
            >
              {is4dMode ? t('vizInteractHint4d') : t('vizInteractHint')}
            </p>
          </div>
        {/if}
      </div>
    </div>
    {#if coordinateTooltip}
      <div
        bind:this={coordinateTooltipEl}
        class="pointer-events-none absolute z-20 rounded-md border border-border bg-bg px-2.5 py-2 text-xs shadow-lg"
        style={coordinateTooltipStyle(coordinateTooltip)}
      >
        {#if coordinateTooltip.label}
          <p class="mb-1 font-medium text-text">{coordinateTooltip.label}</p>
        {/if}
        <p
          class="flex max-w-[min(100vw-2rem,22rem)] flex-wrap items-baseline gap-x-1.5 gap-y-0.5 font-mono"
        >
          {#each coordinateTooltip.values as item, i (item.name)}
            {#if i > 0}
              <span class="text-text-muted">·</span>
            {/if}
            <span class={item.highlight ? 'font-medium text-text' : 'text-text-muted'}>
              {item.name}={formatValue(item.value)}
            </span>
          {/each}
        </p>
      </div>
    {/if}
  </div>

  <section
    class="shrink-0 border-t border-border-soft pt-2 text-xs{fill ? ' min-h-[2.75rem]' : ''}"
    aria-live="polite"
  >
    {#if selectedItem}
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1{fill ? ' line-clamp-2' : ''}">
        <h4 class="font-medium text-text">
          {selectedItem.item.label ??
            (selectedItem.type === 'point'
              ? pointKindLabel(selectedItem.item.kind)
              : kindLabel(selectedItem.item.kind))}
        </h4>
        <span class="text-text-muted">
          {selectedItem.type === 'point'
            ? t('vizKindPoint')
            : selectedItem.type === 'line'
              ? t('vizKindLine')
              : t('vizKindRegion')}
        </span>
        {#if selectedItem.type === 'point'}
          <span class="font-mono text-text-muted">
            {t('vizCoordinates')}:
            {selectedItem.item.coords
              .map(
                (value, index) =>
                  `${scene.productNames[index] ?? `x${index + 1}`}=${formatValue(value)}`,
              )
              .join(' · ')}
          </span>
          {#if selectedItem.item.meta}
            {#each Object.entries(selectedItem.item.meta).filter(([key]) => key !== 'feasible') as [key, value] (key)}
              <span class="text-text-muted">
                {metaLabel(key)}:
                <span class="font-mono text-text">{formatValue(value)}</span>
              </span>
            {/each}
          {/if}
        {/if}
      </div>
    {:else}
      <p class="text-text-muted">{t('vizHoverPrompt')}</p>
    {/if}
  </section>
</div>
