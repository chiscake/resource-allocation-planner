import { createBlankModel } from '$lib/domain';
import {
  KIND_SENSITIVITY,
  KIND_WHAT_IF_BASE,
  type GuestWhatIfState,
} from '$lib/domain/whatif-generation';
import { t } from '$lib/i18n';
import {
  clearGuest,
  guestWhatIfStateFromSnapshot,
  isGuestWorthUploading,
  loadGuest,
  type GuestSnapshot,
} from '$lib/db/guest';

export type UploadGuestOk = { ok: true; rootId: string | null };
export type UploadGuestErr = { ok: false; error: string };
export type UploadGuestResult = UploadGuestOk | UploadGuestErr;

export type RootInsertRow = {
  owner_id: string;
  title: string;
  kind: 'root';
  model: unknown;
  result: unknown;
  solver_meta: unknown;
};

export type ChildInsertRow = {
  owner_id: string;
  parent_id: string;
  kind: typeof KIND_WHAT_IF_BASE | typeof KIND_SENSITIVITY;
  title: string;
  model: unknown;
  mutation: unknown;
  result: unknown;
  solver_meta: unknown;
  what_if_generation: number;
};

/** Minimal DB surface so unit tests can stub without Supabase. */
export type UploadGuestClient = {
  insertRoot: (
    row: RootInsertRow,
  ) => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
  insertChildren: (rows: ChildInsertRow[]) => Promise<{ error: { message: string } | null }>;
  updateActiveGeneration: (
    rootId: string,
    active: number | null,
  ) => Promise<{ error: { message: string } | null }>;
};

export type UploadGuestOptions = {
  client: UploadGuestClient;
  /** Called only after the full upload succeeds. */
  clearGuest: () => void;
  defaultTitle?: string;
  whatIfTitle?: string;
};

/** Map guest what-if generations → cloud child rows (base + sensitivity). */
export function guestWhatIfChildrenRows(
  userId: string,
  parentId: string,
  state: GuestWhatIfState,
  whatIfTitle: string,
): ChildInsertRow[] {
  const rows: ChildInsertRow[] = [];
  for (const gen of state.generations) {
    rows.push({
      owner_id: userId,
      parent_id: parentId,
      kind: KIND_WHAT_IF_BASE,
      title: whatIfTitle,
      model: gen.base.model,
      mutation: null,
      result: gen.base.result,
      solver_meta: gen.base.solver_meta,
      what_if_generation: gen.generation,
    });
    for (const item of gen.items) {
      rows.push({
        owner_id: userId,
        parent_id: parentId,
        kind: KIND_SENSITIVITY,
        title: item.title || item.mutation.label || item.mutation.kind,
        model: item.model,
        mutation: item.mutation,
        result: item.result,
        solver_meta: item.solver_meta ?? null,
        what_if_generation: gen.generation,
      });
    }
  }
  return rows;
}

/**
 * Upload one guest snapshot to `solve_nodes`.
 * Clears the guest slot **only** when root (+ children + active pointer) all succeed.
 */
export async function uploadGuestSnapshot(
  guest: GuestSnapshot,
  userId: string,
  opts: UploadGuestOptions,
): Promise<UploadGuestResult> {
  const defaultTitle = opts.defaultTitle ?? t('guestScenarioTitle');
  const whatIfTitle = opts.whatIfTitle ?? t('whatIf');
  const whatIfState = guestWhatIfStateFromSnapshot(guest);

  const rootRes = await opts.client.insertRoot({
    owner_id: userId,
    title: guest.title || defaultTitle,
    kind: 'root',
    model: guest.model ?? createBlankModel(),
    result: guest.result ?? null,
    solver_meta: guest.solver_meta ?? null,
  });
  if (rootRes.error || !rootRes.data?.id) {
    return { ok: false, error: t('guestUploadFailed') };
  }

  const rootId = rootRes.data.id;
  const children = guestWhatIfChildrenRows(userId, rootId, whatIfState, whatIfTitle);
  if (children.length > 0) {
    const childRes = await opts.client.insertChildren(children);
    if (childRes.error) {
      return { ok: false, error: t('guestUploadFailed') };
    }
  }

  const active = whatIfState.activeGeneration;
  if (active != null || whatIfState.generations.length > 0) {
    const upRes = await opts.client.updateActiveGeneration(rootId, active);
    if (upRes.error) {
      return { ok: false, error: t('guestUploadFailed') };
    }
  }

  opts.clearGuest();
  return { ok: true, rootId };
}

/** Lazy supabase wiring so unit tests can stub `UploadGuestClient` without env keys. */
export async function createSupabaseUploadClient(): Promise<UploadGuestClient> {
  const { supabase } = await import('$lib/db/supabase');
  return {
    async insertRoot(row) {
      return supabase.from('solve_nodes').insert(row).select('id').single();
    },
    async insertChildren(rows) {
      return supabase.from('solve_nodes').insert(rows);
    },
    async updateActiveGeneration(rootId, active) {
      return supabase
        .from('solve_nodes')
        .update({ active_what_if_generation: active })
        .eq('id', rootId);
    },
  };
}

/**
 * Load the guest slot (if worth uploading) and persist to cloud.
 * Empty / worthless slots are cleared without an insert.
 */
export async function uploadGuestIfAny(
  userId: string,
  overrides?: Partial<UploadGuestOptions> & { loadGuest?: () => GuestSnapshot | null },
): Promise<UploadGuestResult> {
  const load = overrides?.loadGuest ?? loadGuest;
  const guest = load();
  if (!guest) return { ok: true, rootId: null };

  const doClear = overrides?.clearGuest ?? clearGuest;
  if (!isGuestWorthUploading(guest)) {
    doClear();
    return { ok: true, rootId: null };
  }

  const client = overrides?.client ?? (await createSupabaseUploadClient());
  return uploadGuestSnapshot(guest, userId, {
    client,
    clearGuest: doClear,
    defaultTitle: overrides?.defaultTitle,
    whatIfTitle: overrides?.whatIfTitle,
  });
}
