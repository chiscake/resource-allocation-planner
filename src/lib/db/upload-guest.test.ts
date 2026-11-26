import { describe, expect, it, vi } from 'vitest';
import { createBlankModel, type Mutation, type SolveResult } from '$lib/domain';
import type { GuestWhatIfState } from '$lib/domain/whatif-generation';
import { t } from '$lib/i18n';
import type { GuestSnapshot } from '$lib/db/guest';
import {
  guestWhatIfChildrenRows,
  uploadGuestIfAny,
  uploadGuestSnapshot,
  type UploadGuestClient,
} from '$lib/db/upload-guest';

function baseResult(Z: number): SolveResult {
  return {
    x: {},
    Z,
    resource_usage: {},
    resource_slack: {},
    shadow_prices: {},
    critical_resources: [],
    non_critical_resources: [],
    feasible: true,
  };
}

function mut(label = 'Δ'): Mutation {
  return { kind: 'resource_change', target: 'Труд', delta: 0.1, label };
}

function guestWithWhatIf(active: number | null = 1): GuestSnapshot {
  const model = createBlankModel();
  const state: GuestWhatIfState = {
    activeGeneration: active,
    generations: [
      {
        generation: 1,
        base: { model, result: baseResult(10), solver_meta: null },
        items: [
          {
            title: 'Труд +10%',
            mutation: mut('Труд +10%'),
            model,
            result: baseResult(11),
            solver_meta: null,
          },
        ],
      },
    ],
  };
  return {
    title: 'Гостевая',
    model,
    result: baseResult(10),
    solver_meta: { venue: 'local', library: 'simplex-native@local', duration_ms: 1 },
    what_if_state: state,
    updated_at: new Date().toISOString(),
  };
}

function mockClient(opts?: {
  rootError?: string;
  childrenError?: string;
  updateError?: string;
  rootId?: string;
}): UploadGuestClient & {
  inserts: { root?: unknown; children?: unknown; active?: { id: string; active: number | null } };
} {
  const inserts: {
    root?: unknown;
    children?: unknown;
    active?: { id: string; active: number | null };
  } = {};
  return {
    inserts,
    async insertRoot(row) {
      inserts.root = row;
      if (opts?.rootError) return { data: null, error: { message: opts.rootError } };
      return { data: { id: opts?.rootId ?? 'root-1' }, error: null };
    },
    async insertChildren(rows) {
      inserts.children = rows;
      if (opts?.childrenError) return { error: { message: opts.childrenError } };
      return { error: null };
    },
    async updateActiveGeneration(rootId, active) {
      inserts.active = { id: rootId, active };
      if (opts?.updateError) return { error: { message: opts.updateError } };
      return { error: null };
    },
  };
}

describe('guestWhatIfChildrenRows', () => {
  it('emits what_if_base + sensitivity rows per generation', () => {
    const guest = guestWithWhatIf(1);
    const state = guest.what_if_state!;
    const rows = guestWhatIfChildrenRows('user-1', 'root-1', state, 'Анализ чувствительности');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: 'what_if_base',
      parent_id: 'root-1',
      what_if_generation: 1,
      mutation: null,
    });
    expect(rows[1]).toMatchObject({
      kind: 'sensitivity',
      title: 'Труд +10%',
      what_if_generation: 1,
    });
  });
});

describe('uploadGuestSnapshot', () => {
  it('clears guest only after full success (root + children + active)', async () => {
    const client = mockClient();
    const clear = vi.fn();
    const guest = guestWithWhatIf(1);

    const result = await uploadGuestSnapshot(guest, 'user-1', {
      client,
      clearGuest: clear,
    });

    expect(result).toEqual({ ok: true, rootId: 'root-1' });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(client.inserts.root).toMatchObject({
      owner_id: 'user-1',
      title: 'Гостевая',
      kind: 'root',
    });
    expect(client.inserts.children).toHaveLength(2);
    expect(client.inserts.active).toEqual({ id: 'root-1', active: 1 });
  });

  it('keeps guest slot when root insert fails', async () => {
    const client = mockClient({ rootError: 'boom' });
    const clear = vi.fn();

    const result = await uploadGuestSnapshot(guestWithWhatIf(), 'user-1', {
      client,
      clearGuest: clear,
    });

    expect(result).toEqual({ ok: false, error: t('guestUploadFailed') });
    expect(clear).not.toHaveBeenCalled();
    expect(client.inserts.children).toBeUndefined();
  });

  it('keeps guest slot when children insert fails', async () => {
    const client = mockClient({ childrenError: 'child boom' });
    const clear = vi.fn();

    const result = await uploadGuestSnapshot(guestWithWhatIf(), 'user-1', {
      client,
      clearGuest: clear,
    });

    expect(result).toEqual({ ok: false, error: t('guestUploadFailed') });
    expect(clear).not.toHaveBeenCalled();
    expect(client.inserts.root).toBeDefined();
    expect(client.inserts.active).toBeUndefined();
  });

  it('keeps guest slot when active_what_if_generation update fails', async () => {
    const client = mockClient({ updateError: 'upd boom' });
    const clear = vi.fn();

    const result = await uploadGuestSnapshot(guestWithWhatIf(), 'user-1', {
      client,
      clearGuest: clear,
    });

    expect(result).toEqual({ ok: false, error: t('guestUploadFailed') });
    expect(clear).not.toHaveBeenCalled();
  });

  it('uploads root without children when there is no what-if history', async () => {
    const client = mockClient();
    const clear = vi.fn();
    const guest: GuestSnapshot = {
      title: 'Только корень',
      model: createBlankModel(),
      result: baseResult(5),
      updated_at: new Date().toISOString(),
    };

    const result = await uploadGuestSnapshot(guest, 'user-1', {
      client,
      clearGuest: clear,
    });

    expect(result.ok).toBe(true);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(client.inserts.children).toBeUndefined();
    expect(client.inserts.active).toBeUndefined();
  });
});

describe('uploadGuestIfAny', () => {
  it('clears worthless guest without inserting', async () => {
    const client = mockClient();
    const clear = vi.fn();
    const blank: GuestSnapshot = {
      title: 'Пусто',
      model: createBlankModel(),
      updated_at: new Date().toISOString(),
    };

    const result = await uploadGuestIfAny('user-1', {
      client,
      clearGuest: clear,
      loadGuest: () => blank,
    });

    expect(result).toEqual({ ok: true, rootId: null });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(client.inserts.root).toBeUndefined();
  });

  it('returns ok with null when no guest slot', async () => {
    const result = await uploadGuestIfAny('user-1', {
      client: mockClient(),
      clearGuest: vi.fn(),
      loadGuest: () => null,
    });
    expect(result).toEqual({ ok: true, rootId: null });
  });
});
