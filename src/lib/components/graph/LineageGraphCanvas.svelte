<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    GRAPH,
    createSimEdges,
    createSimNodes,
    drawGraph,
    fitCamera,
    hitTestNode,
    simulateLayout,
    type Camera,
    type GraphEdgeInput,
    type GraphNodeInput,
    type SimEdge,
    type SimNode,
  } from '$lib/graph';

  interface Props {
    nodes?: GraphNodeInput[];
    edges?: GraphEdgeInput[];
    selectedId?: string | null;
    onselect?: (id: string | null) => void;
  }

  let { nodes = [], edges = [], selectedId = null, onselect }: Props = $props();

  let wrapEl: HTMLDivElement | undefined = $state();
  let canvasEl: HTMLCanvasElement | undefined = $state();
  let tooltip = $state<{ text: string; x: number; y: number } | null>(null);
  let grabbing = $state(false);

  /** Layout / camera live outside reactive graph — avoids effect_update_depth_exceeded. */
  let simNodes: SimNode[] = [];
  let simEdges: SimEdge[] = [];
  let cam: Camera = { x: 0, y: 0, scale: 1 };

  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  let panning = false;
  let dragMoved = false;
  let panStart = { x: 0, y: 0 };
  let camAtPan: Camera = { x: 0, y: 0, scale: 1 };
  let raf = 0;
  let lastNodeSig = '';
  let lastEdgeSig = '';

  function nodeSig(list: GraphNodeInput[]): string {
    return `${list.length}:${list.map((n) => `${n.id}\x1f${n.name}\x1f${n.gray}\x1f${n.role}`).join('\0')}`;
  }

  function edgeSig(list: GraphEdgeInput[]): string {
    return `${list.length}:${list.map((e) => `${e.id}\x1f${e.fromId}\x1f${e.toId}\x1f${e.kind}`).join('\0')}`;
  }

  function resize() {
    if (!wrapEl || !canvasEl) return;
    const nextW = Math.max(Math.floor(wrapEl.clientWidth), 1);
    const nextH = Math.max(Math.floor(wrapEl.clientHeight), 1);
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (nextW === cssW && nextH === cssH && nextDpr === dpr) return;
    cssW = nextW;
    cssH = nextH;
    dpr = nextDpr;
    // Buffer size only — do not set style width/height (avoids ResizeObserver feedback).
    canvasEl.width = Math.floor(cssW * dpr);
    canvasEl.height = Math.floor(cssH * dpr);
    scheduleDraw();
  }

  function scheduleDraw() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      paint();
    });
  }

  function paint() {
    if (!canvasEl || cssW < 1 || cssH < 1) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGraph(ctx, simNodes, simEdges, cam, cssW, cssH, selectedId);
  }

  function rebuild(nextNodes: GraphNodeInput[], nextEdges: GraphEdgeInput[]) {
    simNodes = createSimNodes(nextNodes);
    simEdges = createSimEdges(nextEdges);
    simulateLayout(simNodes, simEdges);
    if (cssW > 0 && cssH > 0) {
      cam = fitCamera(simNodes, cssW, cssH);
    }
    scheduleDraw();
  }

  function localPoint(e: PointerEvent): { x: number; y: number } {
    const rect = canvasEl!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: PointerEvent) {
    if (!canvasEl) return;
    canvasEl.setPointerCapture(e.pointerId);
    panning = true;
    dragMoved = false;
    grabbing = true;
    panStart = { x: e.clientX, y: e.clientY };
    camAtPan = { ...cam };
  }

  function onPointerMove(e: PointerEvent) {
    if (!canvasEl) return;
    const pt = localPoint(e);
    if (panning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      if (Math.hypot(dx, dy) > GRAPH.dragClickSlopPx) dragMoved = true;
      cam = {
        x: camAtPan.x - dx / camAtPan.scale,
        y: camAtPan.y - dy / camAtPan.scale,
        scale: camAtPan.scale,
      };
      tooltip = null;
      scheduleDraw();
      return;
    }
    const hit = hitTestNode(simNodes, cam, pt.x, pt.y, cssW, cssH);
    if (hit) {
      tooltip = { text: hit.data.name, x: e.clientX, y: e.clientY };
    } else {
      tooltip = null;
    }
  }

  function onPointerUp(e: PointerEvent) {
    panning = false;
    grabbing = false;
    if (!canvasEl) return;
    try {
      canvasEl.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (dragMoved) return;
    const pt = localPoint(e);
    const hit = hitTestNode(simNodes, cam, pt.x, pt.y, cssW, cssH);
    onselect?.(hit?.id ?? null);
  }

  function onPointerLeave() {
    if (!panning) tooltip = null;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? GRAPH.wheelZoomFactor : 1 / GRAPH.wheelZoomFactor;
    const next = Math.min(GRAPH.maxScale, Math.max(GRAPH.minScale, cam.scale * factor));
    if (!canvasEl) return;
    const pt = { x: e.offsetX, y: e.offsetY };
    const wx = (pt.x - cssW / 2) / cam.scale + cam.x;
    const wy = (pt.y - cssH / 2) / cam.scale + cam.y;
    cam = {
      x: wx - (pt.x - cssW / 2) / next,
      y: wy - (pt.y - cssH / 2) / next,
      scale: next,
    };
    scheduleDraw();
  }

  onMount(() => {
    resize();
    lastNodeSig = nodeSig(nodes);
    lastEdgeSig = edgeSig(edges);
    rebuild(nodes, edges);
    const ro = new ResizeObserver(() => resize());
    if (wrapEl) ro.observe(wrapEl);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  });

  // Track only prop identity/signature; mutate sim state outside the reactive graph.
  $effect(() => {
    const n = nodes;
    const e = edges;
    const ns = nodeSig(n);
    const es = edgeSig(e);
    if (ns === lastNodeSig && es === lastEdgeSig) return;
    lastNodeSig = ns;
    lastEdgeSig = es;
    untrack(() => rebuild(n, e));
  });

  $effect(() => {
    selectedId;
    untrack(() => scheduleDraw());
  });
</script>

<div
  bind:this={wrapEl}
  class="relative h-full min-h-[320px] w-full overflow-hidden rounded-[12px] border border-border bg-bg-soft"
>
  <canvas
    bind:this={canvasEl}
    class="absolute inset-0 block h-full w-full touch-none"
    class:cursor-grabbing={grabbing}
    class:cursor-grab={!grabbing}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onpointerleave={onPointerLeave}
    onwheel={onWheel}
  ></canvas>
</div>

{#if tooltip}
  <div
    class="pointer-events-none fixed z-50 max-w-xs rounded-md border border-border bg-bg px-2 py-1 text-xs text-text shadow-sm"
    style="left: {tooltip.x + 12}px; top: {tooltip.y + 12}px"
  >
    {tooltip.text}
  </div>
{/if}
