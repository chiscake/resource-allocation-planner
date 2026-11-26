import type { LineageEdgeKind, LineageNodeRole } from '$lib/domain/lineage-graph';

export type GraphNodeInput = {
  id: string;
  name: string;
  role: LineageNodeRole;
  gray: boolean;
};

export type GraphEdgeInput = {
  id: string;
  fromId: string;
  toId: string;
  kind: LineageEdgeKind;
};

export type SimNode = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  data: GraphNodeInput;
};

export type SimEdge = {
  id: string;
  fromId: string;
  toId: string;
  kind: LineageEdgeKind;
};

export type Camera = {
  x: number;
  y: number;
  scale: number;
};
