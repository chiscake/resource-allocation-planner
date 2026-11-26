import { getOfflineBackend } from '$lib/db/offline-idb';
import type { Model, Mutation, SolveResult, SolverMeta } from '$lib/domain';

export const OFFLINE_TASK_LRU_MAX = 20;

/** Serializable solve_nodes row subset for offline cache. */
export type CachedSolveNode = {
  id: string;
  title: string;
  kind: string;
  model: Model;
  result: SolveResult | null;
  parent_id: string | null;
  what_if_generation: number | null;
  active_what_if_generation: number | null;
  deleted_at: string | null;
  mutation: Mutation | null;
  org_id: string | null;
  org_visibility: 'private' | 'org' | null;
  is_favorite: boolean;
  owner_id: string;
  solver_meta?: SolverMeta | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type CachedTaskRecord = {
  id: string;
  title: string;
  root: CachedSolveNode;
  children: CachedSolveNode[];
  dirty: boolean;
  cachedAt: string;
  lastAccessAt: string;
};

export type TaskListItem = {
  id: string;
  title: string;
  updated_at: string;
  created_at?: string;
  is_favorite: boolean;
  org_id: string | null;
  org_visibility: string | null;
  model: Model | null;
  dirty: boolean;
};

/** Pure LRU trim — exported for unit tests. */
export function trimTaskLru(records: CachedTaskRecord[], max = OFFLINE_TASK_LRU_MAX): string[] {
  if (records.length <= max) return [];
  const sorted = [...records].sort(
    (a, b) => new Date(a.lastAccessAt).getTime() - new Date(b.lastAccessAt).getTime(),
  );
  const drop = sorted.slice(0, records.length - max);
  return drop.map((r) => r.id);
}

async function enforceLru(): Promise<void> {
  const backend = getOfflineBackend();
  const all = await backend.getAll<CachedTaskRecord>('tasks');
  if (all.length <= OFFLINE_TASK_LRU_MAX) return;
  // Prefer keeping dirty tasks; among equals, keep most recently accessed.
  const ranked = [...all].sort((a, b) => {
    if (a.dirty !== b.dirty) return a.dirty ? 1 : -1;
    return new Date(a.lastAccessAt).getTime() - new Date(b.lastAccessAt).getTime();
  });
  const toDrop = ranked.slice(0, ranked.length - OFFLINE_TASK_LRU_MAX);
  for (const rec of toDrop) {
    await backend.delete('tasks', rec.id);
  }
}

export async function putCachedTask(
  input: Omit<CachedTaskRecord, 'cachedAt' | 'lastAccessAt'> & {
    cachedAt?: string;
    lastAccessAt?: string;
  },
): Promise<CachedTaskRecord> {
  const now = new Date().toISOString();
  const prev = await getOfflineBackend().get<CachedTaskRecord>('tasks', input.id);
  const record: CachedTaskRecord = {
    id: input.id,
    title: input.title,
    root: input.root,
    children: input.children,
    dirty: input.dirty,
    cachedAt: input.cachedAt ?? prev?.cachedAt ?? now,
    lastAccessAt: input.lastAccessAt ?? now,
  };
  await getOfflineBackend().put('tasks', record.id, record);
  await enforceLru();
  return record;
}

export async function touchCachedTask(id: string): Promise<void> {
  const prev = await getOfflineBackend().get<CachedTaskRecord>('tasks', id);
  if (!prev) return;
  await getOfflineBackend().put('tasks', id, {
    ...prev,
    lastAccessAt: new Date().toISOString(),
  });
}

export async function getCachedTask(id: string): Promise<CachedTaskRecord | null> {
  const rec = await getOfflineBackend().get<CachedTaskRecord>('tasks', id);
  return rec ?? null;
}

export async function listCachedTasks(): Promise<TaskListItem[]> {
  const all = await getOfflineBackend().getAll<CachedTaskRecord>('tasks');
  return all
    .map((rec) => ({
      id: rec.id,
      title: rec.title,
      updated_at: rec.root.updated_at ?? rec.lastAccessAt,
      created_at: rec.root.created_at ?? undefined,
      is_favorite: rec.root.is_favorite,
      org_id: rec.root.org_id,
      org_visibility: rec.root.org_visibility,
      model: rec.root.model,
      dirty: rec.dirty,
    }))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export async function setCachedTaskDirty(id: string, dirty: boolean): Promise<void> {
  const prev = await getOfflineBackend().get<CachedTaskRecord>('tasks', id);
  if (!prev) return;
  await getOfflineBackend().put('tasks', id, {
    ...prev,
    dirty,
    lastAccessAt: new Date().toISOString(),
  });
}

export async function deleteCachedTask(id: string): Promise<void> {
  await getOfflineBackend().delete('tasks', id);
}

export async function clearCachedTasks(): Promise<void> {
  await getOfflineBackend().clear('tasks');
}
