<script lang="ts">
  import {
    VIEW_SNAP_CORNER_IDS,
    applyOrbit4,
    dragAxisTip4,
    mat4ArcMat,
    mat4Col,
    mat4Rotate,
    projectViewOrtho,
    quatForSnap,
    rotateByQuat,
    snapAxisTowardCamera4,
    type Mat4,
    type Quat,
    type ViewSnapId,
  } from './math';
  import { t } from '$lib/i18n';

  let {
    quat,
    size = 120,
    mode = '3d',
    rot4 = $bindable<Mat4 | undefined>(undefined),
    onSnap,
    onInteract,
    /** Background orbit; when set, parent owns angles (tip-drag still updates rot4). */
    onOrbit4,
  }: {
    quat: Quat;
    /** Disc diameter for 3D; 4D adds a w-readout strip below. */
    size?: number;
    mode?: '3d' | '4d';
    rot4?: Mat4;
    onSnap: (next: Quat, id: ViewSnapId) => void;
    /** Fired when the user starts interacting (stop auto-rotate). */
    onInteract?: () => void;
    onOrbit4?: (dx: number, dy: number, shift: boolean) => void;
  } = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let hovered3d: ViewSnapId | null = $state(null);
  let hovered4d: { i: number; s: 1 | -1 } | null = $state(null);

  type Drag4 = {
    kind: 'tip' | 'bg';
    hit: { i: number; s: 1 | -1 } | null;
    moved: number;
    x: number;
    y: number;
  };
  let drag4: Drag4 | null = null;
  let snapRaf = 0;

  const AXIS3: {
    id: ViewSnapId;
    label: string;
    color: string;
    dir: [number, number, number];
  }[] = [
    { id: 'px', label: 'X', color: '#ef4444', dir: [1, 0, 0] },
    { id: 'nx', label: '', color: '#ef4444', dir: [-1, 0, 0] },
    { id: 'py', label: 'Y', color: '#22c55e', dir: [0, 1, 0] },
    { id: 'ny', label: '', color: '#22c55e', dir: [0, -1, 0] },
    { id: 'pz', label: 'Z', color: '#3b82f6', dir: [0, 0, 1] },
    { id: 'nz', label: '', color: '#3b82f6', dir: [0, 0, -1] },
  ];

  const AXIS4 = [
    { name: 'X', color: '#ef4444' },
    { name: 'Y', color: '#22c55e' },
    { name: 'Z', color: '#3b82f6' },
    { name: 'W', color: '#a78bfa' },
  ] as const;
  const WARM = '#f5a524';
  const COOL = '#4fc3f7';

  const layout = $derived.by(() => {
    if (mode === '4d') {
      const W = Math.round(size * 1.1);
      const cx = W / 2;
      const cy = size * 0.52;
      const gr = size * 0.35;
      // Header + 4 axis rows (15px) + bottom padding — must fit all bars.
      const barTop = cy + gr + 28;
      const H = Math.ceil(barTop + 18 + 4 * 15 + 12);
      return { W, H, cx, cy, gr };
    }
    return { W: size, H: size, cx: size / 2, cy: size / 2, gr: size * 0.32 };
  });

  type Hit3 = {
    id: ViewSnapId;
    x: number;
    y: number;
    depth: number;
    r: number;
    kind: 'axis' | 'corner';
    label?: string;
    color: string;
  };

  type Tip4 = {
    i: number;
    s: 1 | -1;
    v: number[];
    x: number;
    y: number;
    r: number;
  };

  function hits3(q: Quat, W: number): Hit3[] {
    const cx = W / 2;
    const cy = W / 2;
    const scale = W * 0.32;
    const hits: Hit3[] = [];

    for (const axis of AXIS3) {
      const tip = rotateByQuat(
        axis.dir.map((v) => v * 0.92),
        q,
      );
      const s = projectViewOrtho(tip, scale, cx, cy);
      hits.push({
        id: axis.id,
        x: s.x,
        y: s.y,
        depth: s.depth,
        r: axis.label ? 11 : 6,
        kind: 'axis',
        label: axis.label || undefined,
        color: axis.color,
      });
    }

    for (const id of VIEW_SNAP_CORNER_IDS) {
      const sx = id[0] === 'p' ? 1 : -1;
      const sy = id[1] === 'p' ? 1 : -1;
      const sz = id[2] === 'p' ? 1 : -1;
      const tip = rotateByQuat([sx * 0.55, sy * 0.55, sz * 0.55], q);
      const s = projectViewOrtho(tip, scale, cx, cy);
      hits.push({
        id,
        x: s.x,
        y: s.y,
        depth: s.depth,
        r: 5,
        kind: 'corner',
        color: '#a3a3a3',
      });
    }
    return hits;
  }

  function tips4(R: Mat4): Tip4[] {
    const { cx, cy, gr } = layout;
    const tips: Tip4[] = [];
    for (let i = 0; i < 4; i++) {
      for (const s of [1, -1] as const) {
        const v = mat4Col(R, i).map((x) => x * s);
        tips.push({
          i,
          s,
          v,
          x: cx + gr * (v[0] ?? 0),
          y: cy - gr * (v[1] ?? 0),
          r: s > 0 ? 9 : 5.5,
        });
      }
    }
    return tips;
  }

  function pick3(localX: number, localY: number, hits: Hit3[]): ViewSnapId | null {
    let best: Hit3 | null = null;
    let bestScore = Infinity;
    for (const h of hits) {
      const d = Math.hypot(localX - h.x, localY - h.y);
      if (d > h.r + 4) continue;
      const score = d - h.depth * 2;
      if (score < bestScore) {
        bestScore = score;
        best = h;
      }
    }
    return best?.id ?? null;
  }

  function pick4(R: Mat4, x: number, y: number): Tip4 | null {
    let best: Tip4 | null = null;
    for (const tip of tips4(R)) {
      if (Math.hypot(tip.x - x, tip.y - y) > tip.r + 5) continue;
      if (!best || (tip.v[2] ?? 0) > (best.v[2] ?? 0)) best = tip;
    }
    return best;
  }

  function cancelSnap() {
    if (snapRaf) {
      cancelAnimationFrame(snapRaf);
      snapRaf = 0;
    }
  }

  function animateSnap4(R0: Mat4, axis: number, sign: 1 | -1) {
    const A = snapAxisTowardCamera4(R0, axis, sign);
    if (!A || !rot4) return;
    cancelSnap();
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / 380);
      const f = 1 - Math.pow(1 - u, 3);
      rot4 = mat4Rotate(R0, mat4ArcMat(A, f));
      if (u < 1) snapRaf = requestAnimationFrame(step);
      else snapRaf = 0;
    };
    snapRaf = requestAnimationFrame(step);
  }

  $effect(() => {
    const canvas = canvasEl;
    if (!canvas) return;
    void quat;
    void size;
    void mode;
    void rot4;
    void hovered3d;
    void hovered4d;
    const { W, H, cx, cy, gr } = layout;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (mode === '4d' && rot4) {
      draw4d(ctx, rot4, W, H, cx, cy, gr);
    } else {
      draw3d(ctx, W);
    }
  });

  function draw3d(ctx: CanvasRenderingContext2D, W: number) {
    const cx = W / 2;
    const cy = W / 2;
    const scale = W * 0.32;

    ctx.beginPath();
    ctx.arc(cx, cy, W * 0.48, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const origin = projectViewOrtho([0, 0, 0], scale, cx, cy);
    const hits = hits3(quat, W);
    const sorted = [...hits].sort((a, b) => a.depth - b.depth);

    for (const h of sorted) {
      if (h.kind === 'axis' && h.label) {
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(h.x, h.y);
        ctx.strokeStyle = h.color;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    for (const h of sorted) {
      const active = hovered3d === h.id;
      ctx.beginPath();
      ctx.arc(h.x, h.y, active ? h.r + 1.5 : h.r, 0, Math.PI * 2);
      if (h.kind === 'corner') {
        ctx.fillStyle = active ? '#737373' : 'rgba(163,163,163,0.55)';
        ctx.fill();
      } else if (h.label) {
        ctx.fillStyle = h.color;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(h.r)}px IBM Plex Sans, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(h.label, h.x, h.y + 0.5);
      } else {
        ctx.fillStyle = active ? h.color : `${h.color}99`;
        ctx.fill();
      }
    }
  }

  function draw4d(
    ctx: CanvasRenderingContext2D,
    R: Mat4,
    W: number,
    _H: number,
    cx: number,
    cy: number,
    gr: number,
  ) {
    ctx.beginPath();
    ctx.arc(cx, cy, gr + 20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const tips = tips4(R).sort((a, b) => (a.v[2] ?? 0) - (b.v[2] ?? 0));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const tip of tips) {
      const ax = AXIS4[tip.i]!;
      const zf = 1 + 0.12 * (tip.v[2] ?? 0);
      const aw = Math.min(1, Math.abs(tip.v[3] ?? 0));
      if (tip.s > 0) {
        ctx.strokeStyle = ax.color;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
      }
      const r = tip.r * zf;
      ctx.globalAlpha = (tip.s > 0 ? 1 : 0.5) * (1 - 0.6 * aw);
      ctx.fillStyle = ax.color;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (aw > 0.04) {
        ctx.strokeStyle = (tip.v[3] ?? 0) > 0 ? WARM : COOL;
        ctx.lineWidth = 1.5;
        ctx.setLineDash((tip.v[3] ?? 0) > 0 ? [] : [3, 3]);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, r + 3 + 7 * aw, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (hovered4d && hovered4d.i === tip.i && hovered4d.s === tip.s) {
        ctx.strokeStyle = '#171717';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, r + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (tip.s > 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px IBM Plex Sans, system-ui, sans-serif';
        ctx.fillText(ax.name, tip.x, tip.y + 0.5);
      }
    }

    // w-readout bars
    const barTop = cy + gr + 28;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font = '11px IBM Plex Sans, system-ui, sans-serif';
    ctx.fillText(t('vizGizmoWHint'), 10, barTop);

    for (let i = 0; i < 4; i++) {
      const y = barTop + 18 + i * 15;
      const wComp = mat4Col(R, i)[3] ?? 0;
      const ax = AXIS4[i]!;
      ctx.fillStyle = ax.color;
      ctx.font = '600 11px IBM Plex Sans, system-ui, sans-serif';
      ctx.fillText(ax.name, 10, y);
      const barX = 28;
      const barW = W - 56;
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(barX, y - 4, barW, 6);
      const mid = barX + barW / 2;
      ctx.fillStyle = wComp > 0 ? WARM : COOL;
      ctx.fillRect(mid, y - 4, (barW / 2) * wComp, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(mid - 0.5, y - 6, 1, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${wComp >= 0 ? '+' : '−'}${Math.abs(wComp).toFixed(2)}`, W - 8, y);
      ctx.textAlign = 'left';
    }
  }

  function localPos(e: PointerEvent) {
    const rect = canvasEl!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * layout.W,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * layout.H,
    };
  }

  function onPointerMove3(e: PointerEvent) {
    const p = localPos(e);
    hovered3d = pick3(p.x, p.y, hits3(quat, layout.W));
  }

  function onPointerLeave3() {
    hovered3d = null;
  }

  function onClick3(e: MouseEvent) {
    e.stopPropagation();
    const rect = canvasEl!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * layout.W;
    const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * layout.H;
    const id = pick3(x, y, hits3(quat, layout.W));
    if (!id) return;
    onInteract?.();
    onSnap(quatForSnap(id), id);
  }

  function onPointerDown4(e: PointerEvent) {
    if (!rot4 || !canvasEl) return;
    e.stopPropagation();
    e.preventDefault();
    onInteract?.();
    cancelSnap();
    canvasEl.setPointerCapture(e.pointerId);
    const p = localPos(e);
    const hit = pick4(rot4, p.x, p.y);
    drag4 = {
      kind: hit ? 'tip' : 'bg',
      hit: hit ? { i: hit.i, s: hit.s } : null,
      moved: 0,
      x: e.clientX,
      y: e.clientY,
    };
  }

  function onPointerMove4(e: PointerEvent) {
    if (!rot4) return;
    const p = localPos(e);
    if (!drag4) {
      const hit = pick4(rot4, p.x, p.y);
      hovered4d = hit ? { i: hit.i, s: hit.s } : null;
      if (canvasEl) canvasEl.style.cursor = hit ? 'grab' : 'default';
      return;
    }
    const dx = e.clientX - drag4.x;
    const dy = e.clientY - drag4.y;
    drag4.x = e.clientX;
    drag4.y = e.clientY;
    drag4.moved += Math.abs(dx) + Math.abs(dy);
    if (drag4.kind === 'tip' && drag4.hit) {
      rot4 = dragAxisTip4(rot4, drag4.hit.i, drag4.hit.s, dx, dy, e.shiftKey, layout.gr);
    } else if (onOrbit4) {
      onOrbit4(dx, dy, e.shiftKey);
    } else {
      rot4 = applyOrbit4(rot4, dx, dy, e.shiftKey);
    }
  }

  function onPointerUp4() {
    if (!rot4 || !drag4) {
      drag4 = null;
      return;
    }
    if (drag4.kind === 'tip' && drag4.hit && drag4.moved < 4) {
      animateSnap4(rot4, drag4.hit.i, drag4.hit.s);
    }
    drag4 = null;
  }

  function onPointerLeave4() {
    if (!drag4) hovered4d = null;
  }

  function onDblClick4(e: MouseEvent) {
    e.stopPropagation();
    // Parent owns reset via scene dblclick; ignore tip hits here.
  }
</script>

<div
  class="pointer-events-auto absolute right-2 top-2 select-none"
  style:width="{layout.W}px"
  style:height="{layout.H}px"
  role="group"
  aria-label={t('vizGizmo')}
>
  {#if mode === '4d'}
    <canvas
      bind:this={canvasEl}
      class="block size-full touch-none"
      width={layout.W}
      height={layout.H}
      title={t('vizGizmo4dHint')}
      aria-label={t('vizGizmo4dHint')}
      onpointerdown={onPointerDown4}
      onpointermove={onPointerMove4}
      onpointerup={onPointerUp4}
      onpointercancel={onPointerUp4}
      onpointerleave={onPointerLeave4}
      ondblclick={onDblClick4}
    ></canvas>
  {:else}
    <canvas
      bind:this={canvasEl}
      class="block size-full cursor-pointer touch-none"
      width={layout.W}
      height={layout.H}
      title={t('vizGizmoSnap')}
      aria-label={t('vizGizmoSnap')}
      onpointermove={onPointerMove3}
      onpointerleave={onPointerLeave3}
      onclick={onClick3}
    ></canvas>
  {/if}
</div>
