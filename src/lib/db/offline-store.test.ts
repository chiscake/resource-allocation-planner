import { describe, expect, it, beforeEach } from 'vitest';
import { createMemoryOfflineBackend, setOfflineBackend } from '$lib/db/offline-idb';
import {
  savePublicTemplatesCache,
  loadPublicTemplatesCache,
  clearPublicTemplatesCache,
  savePersonalTemplatesCache,
  loadPersonalTemplatesCache,
  findCachedTemplateRow,
  upsertPersonalTemplateCache,
  savePersonalTemplatesCacheMergingDirty,
} from '$lib/db/offline-templates';
import { createBlankModel } from '$lib/domain';
import {
  putCachedTask,
  getCachedTask,
  listCachedTasks,
  setCachedTaskDirty,
  trimTaskLru,
  OFFLINE_TASK_LRU_MAX,
  type CachedSolveNode,
  type CachedTaskRecord,
} from '$lib/db/offline-tasks';
function rootNode(id: string, title: string): CachedSolveNode {
  return {
    id,
    title,
    kind: 'root',
    model: createBlankModel(),
    result: null,
    parent_id: null,
    what_if_generation: null,
    active_what_if_generation: null,
    deleted_at: null,
    mutation: null,
    org_id: null,
    org_visibility: null,
    is_favorite: false,
    owner_id: 'user-1',
    updated_at: new Date().toISOString(),
  };
}

beforeEach(() => {
  setOfflineBackend(createMemoryOfflineBackend());
});

describe('public templates cache', () => {
  it('round-trips a snapshot', async () => {
    await savePublicTemplatesCache([{ id: 't1', title: 'A', model: null, owner_id: null }]);
    const snap = await loadPublicTemplatesCache();
    expect(snap?.rows).toHaveLength(1);
    expect(snap?.rows[0].title).toBe('A');
    await clearPublicTemplatesCache();
    expect(await loadPublicTemplatesCache()).toBeNull();
  });
});

describe('personal templates cache', () => {
  it('stores per user and finds by id', async () => {
    const model = createBlankModel();
    await savePersonalTemplatesCache('user-1', [
      {
        id: 'p1',
        title: 'Mine',
        model,
        updated_at: null,
        system_kind: null,
        publish_status: null,
      },
    ]);
    const snap = await loadPersonalTemplatesCache('user-1');
    expect(snap?.rows[0].title).toBe('Mine');
    expect(await loadPersonalTemplatesCache('other')).toBeNull();
    const found = await findCachedTemplateRow('p1', 'user-1');
    expect(found?.title).toBe('Mine');
  });

  it('keeps dirty and localOnly rows across cloud merge', async () => {
    const model = createBlankModel();
    await upsertPersonalTemplateCache('user-1', {
      id: 'local-1',
      title: 'Offline',
      model,
      updated_at: '2026-01-01T00:00:00Z',
      system_kind: null,
      publish_status: null,
      dirty: false,
      localOnly: true,
    });
    const snap = await savePersonalTemplatesCacheMergingDirty('user-1', [
      {
        id: 'cloud-1',
        title: 'Cloud',
        model,
        updated_at: '2026-01-02T00:00:00Z',
        system_kind: null,
        publish_status: null,
        dirty: false,
      },
    ]);
    expect(snap.rows.map((r) => r.id).sort()).toEqual(['cloud-1', 'local-1']);
    expect(snap.rows.find((r) => r.id === 'local-1')?.localOnly).toBe(true);
  });
});

describe('trimTaskLru', () => {
  it('drops oldest by lastAccessAt', () => {
    const mk = (id: string, at: string): CachedTaskRecord => ({
      id,
      title: id,
      root: rootNode(id, id),
      children: [],
      dirty: false,
      cachedAt: at,
      lastAccessAt: at,
    });
    const drop = trimTaskLru(
      [
        mk('a', '2020-01-01T00:00:00Z'),
        mk('b', '2021-01-01T00:00:00Z'),
        mk('c', '2022-01-01T00:00:00Z'),
      ],
      2,
    );
    expect(drop).toEqual(['a']);
  });
});

describe('cached tasks', () => {
  it('stores dirty flag and lists it', async () => {
    await putCachedTask({
      id: 'n1',
      title: 'Task',
      root: rootNode('n1', 'Task'),
      children: [],
      dirty: false,
    });
    await setCachedTaskDirty('n1', true);
    const rec = await getCachedTask('n1');
    expect(rec?.dirty).toBe(true);
    const list = await listCachedTasks();
    expect(list[0].dirty).toBe(true);
  });

  it('enforces LRU max preferring dirty retention', async () => {
    for (let i = 0; i < OFFLINE_TASK_LRU_MAX + 3; i++) {
      const id = `n${i}`;
      await putCachedTask({
        id,
        title: id,
        root: rootNode(id, id),
        children: [],
        dirty: i === 0,
        lastAccessAt: new Date(2020, 0, i + 1).toISOString(),
      });
    }
    const list = await listCachedTasks();
    expect(list.length).toBe(OFFLINE_TASK_LRU_MAX);
    expect(list.some((r) => r.id === 'n0' && r.dirty)).toBe(true);
  });

  it('keeps full children tree', async () => {
    const child: CachedSolveNode = {
      ...rootNode('c1', 'child'),
      parent_id: 'n1',
      kind: 'what_if_base',
      what_if_generation: 1,
    };
    await putCachedTask({
      id: 'n1',
      title: 'Task',
      root: rootNode('n1', 'Task'),
      children: [child],
      dirty: false,
    });
    const rec = await getCachedTask('n1');
    expect(rec?.children).toHaveLength(1);
    expect(rec?.children[0].what_if_generation).toBe(1);
  });
});
