import { GRAPH } from './constants';
import type { Camera, SimEdge, SimNode } from './types';

export function worldToScreen(
  cam: Camera,
  wx: number,
  wy: number,
  cssW: number,
  cssH: number,
): { x: number; y: number } {
  return {
    x: (wx - cam.x) * cam.scale + cssW / 2,
    y: (wy - cam.y) * cam.scale + cssH / 2,
  };
}

export function screenToWorld(
  cam: Camera,
  sx: number,
  sy: number,
  cssW: number,
  cssH: number,
): { x: number; y: number } {
  return {
    x: (sx - cssW / 2) / cam.scale + cam.x,
    y: (sy - cssH / 2) / cam.scale + cam.y,
  };
}

function drawChevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-size, -size * 0.7);
  ctx.lineTo(0, 0);
  ctx.lineTo(-size, size * 0.7);
  ctx.stroke();
  ctx.restore();
}

/** Draw `>` markers along the edge at fixed screen-pixel spacing. */
function drawDirectedEdge(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();

  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 8) return;
  const angle = Math.atan2(dy, dx);
  const step = GRAPH.arrowStepPx;
  const size = GRAPH.arrowSizePx;
  // Start after a small inset from the source; stop before the target.
  const inset = 14;
  for (let d = inset; d < len - inset; d += step) {
    const t = d / len;
    drawChevron(ctx, ax + dx * t, ay + dy * t, angle, size, color);
  }
}

export function drawGraph(
  ctx: CanvasRenderingContext2D,
  nodes: SimNode[],
  edges: SimEdge[],
  cam: Camera,
  cssW: number,
  cssH: number,
  selectedId: string | null,
) {
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = GRAPH.colorBg;
  ctx.fillRect(0, 0, cssW, cssH);

  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const e of edges) {
    const a = byId.get(e.fromId);
    const b = byId.get(e.toId);
    if (!a || !b) continue;
    const as = worldToScreen(cam, a.x, a.y, cssW, cssH);
    const bs = worldToScreen(cam, b.x, b.y, cssW, cssH);
    const color = e.kind === 'fork' ? GRAPH.colorEdgeFork : GRAPH.colorEdgeParent;
    drawDirectedEdge(ctx, as.x, as.y, bs.x, bs.y, color);
  }

  for (const n of nodes) {
    const p = worldToScreen(cam, n.x, n.y, cssW, cssH);
    const r = n.radius * cam.scale;
    const selected = selectedId === n.id;
    const isMut = n.data.role === 'sensitivity';
    const stroke = n.data.gray ? GRAPH.colorGray : isMut ? GRAPH.colorSensitivity : GRAPH.colorRoot;

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    if (isMut && !n.data.gray) {
      ctx.fillStyle = GRAPH.colorSensitivityFill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (n.data.gray && isMut) {
      ctx.fillStyle = GRAPH.colorSensitivityFill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = stroke;
      ctx.fill();
      if (n.data.gray) {
        ctx.strokeStyle = '#737373';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (selected) {
      const ringR = r + GRAPH.selectionRingGapPx;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = GRAPH.colorSelected;
      ctx.lineWidth = GRAPH.selectionRingWidthPx;
      ctx.stroke();
    }
  }

  // Root name chips when zoomed far out (nodes become hard to identify).
  if (cam.scale <= GRAPH.rootLabelMaxScale) {
    ctx.font = `${GRAPH.rootLabelFontPx}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of nodes) {
      if (n.data.role !== 'root') continue;
      const p = worldToScreen(cam, n.x, n.y, cssW, cssH);
      const r = n.radius * cam.scale;
      let text = n.data.name;
      if (text.length > GRAPH.rootLabelMaxChars) {
        text = `${text.slice(0, GRAPH.rootLabelMaxChars - 1)}…`;
      }
      const metrics = ctx.measureText(text);
      const tw = metrics.width + GRAPH.rootLabelPadX * 2;
      const th = GRAPH.rootLabelFontPx + GRAPH.rootLabelPadY * 2;
      const cx = p.x;
      const cy = p.y - r - GRAPH.rootLabelGapPx - th / 2;
      const x0 = cx - tw / 2;
      const y0 = cy - th / 2;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = n.data.gray ? GRAPH.colorGray : '#e5e5e5';
      ctx.lineWidth = 1;
      roundRect(ctx, x0, y0, tw, th, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = n.data.gray ? GRAPH.colorGray : GRAPH.colorLabel;
      ctx.fillText(text, cx, cy);
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function hitTestNode(
  nodes: SimNode[],
  cam: Camera,
  sx: number,
  sy: number,
  cssW: number,
  cssH: number,
): SimNode | null {
  let best: SimNode | null = null;
  let bestD = Infinity;
  for (const n of nodes) {
    const p = worldToScreen(cam, n.x, n.y, cssW, cssH);
    const dx = sx - p.x;
    const dy = sy - p.y;
    const hitR = n.radius * cam.scale + 4;
    const d = dx * dx + dy * dy;
    if (d <= hitR * hitR && d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

export function fitCamera(nodes: SimNode[], cssW: number, cssH: number): Camera {
  if (!nodes.length) return { x: 0, y: 0, scale: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.radius);
    maxX = Math.max(maxX, n.x + n.radius);
    minY = Math.min(minY, n.y - n.radius);
    maxY = Math.max(maxY, n.y + n.radius);
  }
  const w = Math.max(maxX - minX, 40);
  const h = Math.max(maxY - minY, 40);
  const pad = 64;
  const scale = Math.min(
    GRAPH.maxScale,
    Math.max(GRAPH.minScale, Math.min((cssW - pad) / w, (cssH - pad) / h)),
  );
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    scale,
  };
}
