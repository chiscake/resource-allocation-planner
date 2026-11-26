import { GRAPH } from './constants';
import type { GraphEdgeInput, GraphNodeInput, SimEdge, SimNode } from './types';

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function createSimNodes(nodes: GraphNodeInput[]): SimNode[] {
  const n = Math.max(nodes.length, 1);
  return nodes.map((data, i) => {
    const a = (i / n) * Math.PI * 2 + hashSeed(data.id) * 0.4;
    const r = 40 + hashSeed(data.id + 'r') * 80;
    return {
      id: data.id,
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      vx: 0,
      vy: 0,
      radius: data.role === 'root' ? GRAPH.rootRadius : GRAPH.sensitivityRadius,
      data,
    };
  });
}

export function createSimEdges(edges: GraphEdgeInput[]): SimEdge[] {
  return edges.map((e) => ({
    id: e.id,
    fromId: e.fromId,
    toId: e.toId,
    kind: e.kind,
  }));
}

/** Synchronous force layout with parent-down / fork-right bias. */
export function simulateLayout(nodes: SimNode[], edges: SimEdge[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const { iterations, repulsion, springStrength, damping, biasDown, biasRightFork, centerPull } =
    GRAPH;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 1) {
          dx = (hashSeed(a.id) - 0.5) * 0.01;
          dy = (hashSeed(b.id) - 0.5) * 0.01;
          dist2 = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(dist2);
        const force = repulsion / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    for (const e of edges) {
      const a = byId.get(e.fromId);
      const b = byId.get(e.toId);
      if (!a || !b) continue;
      const rest = e.kind === 'fork' ? GRAPH.springLengthFork : GRAPH.springLengthParent;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const diff = dist - rest;
      const f = springStrength * diff;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;

      // Directional bias: child below parent; fork target to the right of source.
      if (e.kind === 'parent') {
        b.vy += biasDown;
      } else {
        b.vx += biasRightFork;
        b.vy += biasDown * 0.5;
      }
    }

    for (const n of nodes) {
      n.vx -= n.x * centerPull;
      n.vy -= n.y * centerPull;
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
    }
  }
}
