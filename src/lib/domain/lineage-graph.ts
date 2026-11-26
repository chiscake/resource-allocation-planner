import { mutationForkTitle, type ForkKind } from './fork-provenance';
import { KIND_SENSITIVITY } from './whatif-generation';
import type { Model, Mutation, SolveResult, SolverMeta } from './types';

export type LineageNodeRole = 'root' | 'sensitivity';

export type LineageEdgeKind = 'parent' | 'fork';

/** Row shape needed to project the lineage graph. */
export type LineageSolveRow = {
  id: string;
  owner_id: string;
  parent_id: string | null;
  kind: string;
  title: string;
  model?: Model | null;
  mutation?: Mutation | null;
  result?: Pick<SolveResult, 'Z'> | SolveResult | null;
  solver_meta?: SolverMeta | null;
  deleted_at?: string | null;
  forked_from_id?: string | null;
  fork_kind?: ForkKind | null;
  fork_source_title?: string | null;
  fork_source_z?: number | null;
};

export type LineageGraphNode = {
  id: string;
  name: string;
  role: LineageNodeRole;
  gray: boolean;
  synthetic: boolean;
  mine: boolean;
  parentRootId: string | null;
  title: string;
  model: Model | null;
  result: Pick<SolveResult, 'Z'> | SolveResult | null;
  mutation: Mutation | null;
  forkSourceZ: number | null;
};

export type LineageGraphEdge = {
  id: string;
  fromId: string;
  toId: string;
  kind: LineageEdgeKind;
};

export type LineageGraph = {
  nodes: LineageGraphNode[];
  edges: LineageGraphEdge[];
};

function isRootRow(row: LineageSolveRow): boolean {
  return row.parent_id == null;
}

function isDeleted(row: LineageSolveRow): boolean {
  return row.deleted_at != null && row.deleted_at !== '';
}

function isLiveSensitivity(row: LineageSolveRow): boolean {
  return row.parent_id != null && row.kind === KIND_SENSITIVITY && !isDeleted(row);
}

function tooltipName(role: LineageNodeRole, taskTitle: string, nodeTitle: string): string {
  if (role === 'sensitivity') return mutationForkTitle(taskTitle, nodeTitle);
  return taskTitle;
}

/**
 * Pure projection: live own roots + their live sensitivity children,
 * plus foreign/synthetic (incl. soft-deleted) sources cited by forked_from_id.
 * Soft-deleted own roots are not drawn as clusters (no orphan mutations).
 */
export function buildLineageGraph(input: {
  myUserId: string;
  myRoots: LineageSolveRow[];
  mySensitivity: LineageSolveRow[];
  /** Rows successfully fetched for forked_from targets (may be partial). */
  fetchedSources: LineageSolveRow[];
}): LineageGraph {
  const { myUserId, myRoots, mySensitivity, fetchedSources } = input;
  const byId = new Map<string, LineageGraphNode>();
  const edges: LineageGraphEdge[] = [];

  const liveRoots = myRoots.filter((r) => isRootRow(r) && !isDeleted(r));
  const liveRootIds = new Set(liveRoots.map((r) => r.id));

  const rootTitleById = new Map<string, string>();
  for (const r of myRoots) {
    if (!isRootRow(r)) continue;
    rootTitleById.set(r.id, r.title);
  }

  function upsert(node: LineageGraphNode) {
    const prev = byId.get(node.id);
    if (!prev) {
      byId.set(node.id, node);
      return;
    }
    // Prefer non-synthetic / richer live data over ghost.
    if (prev.synthetic && !node.synthetic) {
      byId.set(node.id, node);
      return;
    }
    if (!prev.synthetic && node.synthetic) return;
    byId.set(node.id, {
      ...prev,
      ...node,
      gray: prev.gray || node.gray,
      mine: prev.mine || node.mine,
      model: node.model ?? prev.model,
      result: node.result ?? prev.result,
    });
  }

  for (const r of liveRoots) {
    upsert({
      id: r.id,
      name: tooltipName('root', r.title, r.title),
      role: 'root',
      gray: false,
      synthetic: false,
      mine: r.owner_id === myUserId,
      parentRootId: null,
      title: r.title,
      model: r.model ?? null,
      result: r.result ?? null,
      mutation: null,
      forkSourceZ: null,
    });
  }

  for (const s of mySensitivity) {
    if (!isLiveSensitivity(s) || !s.parent_id) continue;
    // Hide mutations whose parent root is soft-deleted / not on the graph.
    if (!liveRootIds.has(s.parent_id)) continue;
    const taskTitle = rootTitleById.get(s.parent_id) ?? '';
    upsert({
      id: s.id,
      name: tooltipName('sensitivity', taskTitle, s.title),
      role: 'sensitivity',
      gray: false,
      synthetic: false,
      mine: s.owner_id === myUserId,
      parentRootId: s.parent_id,
      title: s.title,
      model: s.model ?? null,
      result: s.result ?? null,
      mutation: s.mutation ?? null,
      forkSourceZ: null,
    });
    edges.push({
      id: `parent:${s.parent_id}->${s.id}`,
      fromId: s.parent_id,
      toId: s.id,
      kind: 'parent',
    });
  }

  const fetchedById = new Map(fetchedSources.map((r) => [r.id, r]));

  for (const r of liveRoots) {
    if (!r.forked_from_id || !r.fork_kind) continue;
    const sourceId = r.forked_from_id;
    const fetched = fetchedById.get(sourceId);

    if (fetched) {
      const deleted = isDeleted(fetched);
      const isSens =
        fetched.parent_id != null &&
        (fetched.kind === KIND_SENSITIVITY || fetched.mutation != null);
      const role: LineageNodeRole = isSens ? 'sensitivity' : 'root';
      const parentTitle =
        role === 'sensitivity' && fetched.parent_id
          ? (rootTitleById.get(fetched.parent_id) ??
            fetchedSources.find((x) => x.id === fetched.parent_id)?.title ??
            r.fork_source_title?.split(' · ')[0] ??
            '')
          : fetched.title;
      const name =
        role === 'sensitivity'
          ? (r.fork_source_title ?? tooltipName('sensitivity', parentTitle, fetched.title))
          : fetched.title;
      upsert({
        id: fetched.id,
        name,
        role,
        gray: deleted,
        synthetic: false,
        mine: fetched.owner_id === myUserId,
        parentRootId: fetched.parent_id,
        title: fetched.title,
        model: fetched.model ?? null,
        result: fetched.result ?? null,
        mutation: fetched.mutation ?? null,
        forkSourceZ: null,
      });
    } else {
      upsert({
        id: sourceId,
        name: r.fork_source_title ?? sourceId,
        role: r.fork_kind === 'mutation' ? 'sensitivity' : 'root',
        gray: true,
        synthetic: true,
        mine: false,
        parentRootId: null,
        title: r.fork_source_title ?? sourceId,
        model: null,
        result: null,
        mutation: null,
        forkSourceZ: r.fork_source_z ?? null,
      });
    }

    edges.push({
      id: `fork:${sourceId}->${r.id}`,
      fromId: sourceId,
      toId: r.id,
      kind: 'fork',
    });
  }

  // Drop dangling edges if somehow endpoints missing (should not happen).
  const ids = byId;
  const filteredEdges = edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId));

  return {
    nodes: [...byId.values()],
    edges: filteredEdges,
  };
}

/** Hardcoded stub matching the plan ASCII example (no Supabase). */
export function stubLineageGraph(): LineageGraph {
  const n1 = 'stub-node-1';
  const m1 = 'stub-mut-1';
  const m2 = 'stub-mut-2';
  const m3 = 'stub-mut-3';
  const n2 = 'stub-node-2';
  const n3 = 'stub-node-3';
  const task = 'Node1';
  return buildLineageGraph({
    myUserId: 'me',
    myRoots: [
      {
        id: n1,
        owner_id: 'me',
        parent_id: null,
        kind: 'root',
        title: task,
        result: { Z: 100 } as SolveResult,
      },
      {
        id: n2,
        owner_id: 'me',
        parent_id: null,
        kind: 'root',
        title: 'Node2',
        result: { Z: 100 } as SolveResult,
        forked_from_id: n1,
        fork_kind: 'task',
        fork_source_title: task,
        fork_source_z: 100,
      },
      {
        id: n3,
        owner_id: 'me',
        parent_id: null,
        kind: 'root',
        title: 'Node3',
        result: { Z: 95 } as SolveResult,
        forked_from_id: m2,
        fork_kind: 'mutation',
        fork_source_title: mutationForkTitle(task, 'Mutation 2'),
        fork_source_z: 95,
      },
    ],
    mySensitivity: [
      {
        id: m1,
        owner_id: 'me',
        parent_id: n1,
        kind: KIND_SENSITIVITY,
        title: 'Mutation 1',
        result: { Z: 98 } as SolveResult,
      },
      {
        id: m2,
        owner_id: 'me',
        parent_id: n1,
        kind: KIND_SENSITIVITY,
        title: 'Mutation 2',
        result: { Z: 95 } as SolveResult,
      },
      {
        id: m3,
        owner_id: 'me',
        parent_id: n1,
        kind: KIND_SENSITIVITY,
        title: 'Mutation 3',
        result: { Z: 90 } as SolveResult,
      },
      {
        id: 'stub-n2-m1',
        owner_id: 'me',
        parent_id: n2,
        kind: KIND_SENSITIVITY,
        title: 'Mutation 1',
        result: { Z: 97 } as SolveResult,
      },
      {
        id: 'stub-n2-m2',
        owner_id: 'me',
        parent_id: n2,
        kind: KIND_SENSITIVITY,
        title: 'Mutation 2',
        result: { Z: 94 } as SolveResult,
      },
      {
        id: 'stub-n2-m3',
        owner_id: 'me',
        parent_id: n2,
        kind: KIND_SENSITIVITY,
        title: 'Mutation 3',
        result: { Z: 88 } as SolveResult,
      },
      {
        id: 'stub-n3-m1',
        owner_id: 'me',
        parent_id: n3,
        kind: KIND_SENSITIVITY,
        title: 'Mutation 1',
        result: { Z: 92 } as SolveResult,
      },
      {
        id: 'stub-n3-m2',
        owner_id: 'me',
        parent_id: n3,
        kind: KIND_SENSITIVITY,
        title: 'Mutation 2',
        result: { Z: 91 } as SolveResult,
      },
      {
        id: 'stub-n3-m3',
        owner_id: 'me',
        parent_id: n3,
        kind: KIND_SENSITIVITY,
        title: 'Mutation 3',
        result: { Z: 89 } as SolveResult,
      },
    ],
    fetchedSources: [],
  });
}
