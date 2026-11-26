import { describe, expect, it } from 'vitest';
import { KIND_SENSITIVITY } from './whatif-generation';
import { buildLineageGraph, stubLineageGraph, type LineageSolveRow } from './lineage-graph';

function root(
  partial: Partial<LineageSolveRow> & Pick<LineageSolveRow, 'id' | 'title'>,
): LineageSolveRow {
  return {
    owner_id: 'me',
    parent_id: null,
    kind: 'root',
    ...partial,
  };
}

function sens(
  partial: Partial<LineageSolveRow> & Pick<LineageSolveRow, 'id' | 'title' | 'parent_id'>,
): LineageSolveRow {
  return {
    owner_id: 'me',
    kind: KIND_SENSITIVITY,
    ...partial,
  };
}

describe('buildLineageGraph', () => {
  it('builds parent edges for live sensitivity', () => {
    const g = buildLineageGraph({
      myUserId: 'me',
      myRoots: [root({ id: 'r1', title: 'Task' })],
      mySensitivity: [sens({ id: 's1', parent_id: 'r1', title: 'Mut A' })],
      fetchedSources: [],
    });
    expect(g.nodes).toHaveLength(2);
    expect(g.nodes.find((n) => n.id === 's1')?.name).toBe('Task · Mut A');
    expect(g.edges).toEqual([
      expect.objectContaining({ fromId: 'r1', toId: 's1', kind: 'parent' }),
    ]);
  });

  it('hides soft-deleted own roots and their mutations', () => {
    const g = buildLineageGraph({
      myUserId: 'me',
      myRoots: [root({ id: 'r1', title: 'Gone', deleted_at: '2026-01-01T00:00:00Z' })],
      mySensitivity: [sens({ id: 's1', parent_id: 'r1', title: 'Mut' })],
      fetchedSources: [],
    });
    expect(g.nodes).toHaveLength(0);
    expect(g.edges).toHaveLength(0);
  });

  it('shows soft-deleted root only as gray fork source for a live copy', () => {
    const g = buildLineageGraph({
      myUserId: 'me',
      myRoots: [
        root({ id: 'r1', title: 'Gone', deleted_at: '2026-01-01T00:00:00Z' }),
        root({
          id: 'r2',
          title: 'Copy',
          forked_from_id: 'r1',
          fork_kind: 'task',
          fork_source_title: 'Gone',
          fork_source_z: 1,
        }),
      ],
      mySensitivity: [sens({ id: 's1', parent_id: 'r1', title: 'Mut' })],
      fetchedSources: [root({ id: 'r1', title: 'Gone', deleted_at: '2026-01-01T00:00:00Z' })],
    });
    expect(g.nodes.find((n) => n.id === 'r1')).toMatchObject({ gray: true, role: 'root' });
    expect(g.nodes.find((n) => n.id === 's1')).toBeUndefined();
    expect(g.nodes.find((n) => n.id === 'r2')?.gray).toBe(false);
  });

  it('creates synthetic gray source when fetch missing', () => {
    const g = buildLineageGraph({
      myUserId: 'me',
      myRoots: [
        root({
          id: 'r2',
          title: 'Copy',
          forked_from_id: 'foreign',
          fork_kind: 'task',
          fork_source_title: 'Original',
          fork_source_z: 12,
        }),
      ],
      mySensitivity: [],
      fetchedSources: [],
    });
    const src = g.nodes.find((n) => n.id === 'foreign');
    expect(src).toMatchObject({
      gray: true,
      synthetic: true,
      name: 'Original',
      forkSourceZ: 12,
    });
    expect(
      g.edges.some((e) => e.kind === 'fork' && e.fromId === 'foreign' && e.toId === 'r2'),
    ).toBe(true);
  });

  it('uses fetched foreign source when available (not gray if live)', () => {
    const g = buildLineageGraph({
      myUserId: 'me',
      myRoots: [
        root({
          id: 'r2',
          title: 'Copy',
          forked_from_id: 'foreign',
          fork_kind: 'task',
          fork_source_title: 'Original',
          fork_source_z: 12,
        }),
      ],
      mySensitivity: [],
      fetchedSources: [
        {
          id: 'foreign',
          owner_id: 'them',
          parent_id: null,
          kind: 'root',
          title: 'Original',
          deleted_at: null,
        },
      ],
    });
    const src = g.nodes.find((n) => n.id === 'foreign');
    expect(src?.gray).toBe(false);
    expect(src?.synthetic).toBe(false);
    expect(src?.mine).toBe(false);
  });

  it('stubLineageGraph has three roots and fork edges', () => {
    const g = stubLineageGraph();
    const roots = g.nodes.filter((n) => n.role === 'root');
    expect(roots.length).toBeGreaterThanOrEqual(3);
    expect(g.edges.some((e) => e.kind === 'fork')).toBe(true);
    expect(g.edges.some((e) => e.kind === 'parent')).toBe(true);
  });
});
