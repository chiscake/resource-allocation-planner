import { cloneModel } from './mutations';
import type { Model, Mutation, SolveResult, SolverMeta } from './types';

export const KIND_SENSITIVITY = 'sensitivity';
export const KIND_WHAT_IF_BASE = 'what_if_base';

export type WhatIfBadge = 'current' | 'past';

/** Minimal child shape for generation / pager logic. */
export type WhatIfGenNode = {
  id?: string;
  kind: string;
  what_if_generation: number | null;
  deleted_at?: string | null;
  model: Model;
  result?: SolveResult | null;
  solver_meta?: SolverMeta | null;
  mutation?: Mutation | null;
  title?: string;
};

export type WhatIfPagerSlot =
  | {
      kind: 'generation';
      generation: number;
      badge: WhatIfBadge;
      canRestore: boolean;
    }
  | {
      kind: 'empty_current';
      badge: 'current';
      canRestore: false;
    };

export type GuestWhatIfItem = {
  title: string;
  mutation: Mutation;
  model: Model;
  result: SolveResult | null;
  solver_meta?: SolverMeta | null;
};

export type GuestWhatIfGeneration = {
  generation: number;
  base: {
    model: Model;
    result: SolveResult | null;
    solver_meta: SolverMeta | null;
  };
  items: GuestWhatIfItem[];
};

export type GuestWhatIfState = {
  generations: GuestWhatIfGeneration[];
  activeGeneration: number | null;
};

export function isSensitivityChild(node: WhatIfGenNode): boolean {
  if (node.kind === KIND_WHAT_IF_BASE) return false;
  return (
    node.kind === KIND_SENSITIVITY || (node.what_if_generation != null && node.mutation != null)
  );
}

export function isWhatIfBase(node: WhatIfGenNode): boolean {
  return node.kind === KIND_WHAT_IF_BASE;
}

/** Sorted unique generation numbers from sensitivity / base kids. */
export function collectGenerations(nodes: WhatIfGenNode[]): number[] {
  const set = new Set<number>();
  for (const n of nodes) {
    if (n.what_if_generation != null && (isSensitivityChild(n) || isWhatIfBase(n))) {
      set.add(n.what_if_generation);
    }
  }
  return [...set].sort((a, b) => a - b);
}

export function nextGenerationNumber(generations: number[]): number {
  return (generations.at(-1) ?? 0) + 1;
}

export function findBaseForGeneration(
  nodes: WhatIfGenNode[],
  generation: number,
): WhatIfGenNode | null {
  return nodes.find((n) => isWhatIfBase(n) && n.what_if_generation === generation) ?? null;
}

export function sensitivityForGeneration(
  nodes: WhatIfGenNode[],
  generation: number,
): WhatIfGenNode[] {
  return nodes.filter((n) => isSensitivityChild(n) && n.what_if_generation === generation);
}

/** Live = not soft-deleted (guest has no deleted_at → always live). */
export function isLiveNode(node: WhatIfGenNode): boolean {
  return node.deleted_at == null;
}

export function modelsEqual(a: Model, b: Model): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Pager slots: real generations + optional virtual empty «current».
 * Empty current is opt-in (`includeEmptyCurrent`) — used after a solve with
 * sensitivity enabled when this step has no pack yet. Not after clear / model
 * diverge alone / solve without sensitivity.
 */
export function buildPagerSlots(
  generations: number[],
  activeGeneration: number | null,
  options?: { includeEmptyCurrent?: boolean },
): WhatIfPagerSlot[] {
  const slots: WhatIfPagerSlot[] = generations.map((generation) => {
    const isCurrent = activeGeneration === generation;
    return {
      kind: 'generation' as const,
      generation,
      badge: isCurrent ? ('current' as const) : ('past' as const),
      canRestore: !isCurrent,
    };
  });
  if (activeGeneration == null && options?.includeEmptyCurrent) {
    slots.push({
      kind: 'empty_current',
      badge: 'current',
      canRestore: false,
    });
  }
  return slots;
}

/** Prefer the current badge slot; else last. */
export function defaultPagerIndex(slots: WhatIfPagerSlot[]): number {
  const current = slots.findIndex((s) => s.badge === 'current');
  if (current >= 0) return current;
  return Math.max(0, slots.length - 1);
}

/**
 * If there is an active generation and root model no longer matches its
 * base snapshot → clear pointer (null).
 */
export function resolveActiveAfterModelEdit(
  activeGeneration: number | null,
  baseModel: Model | null | undefined,
  rootModel: Model,
): number | null {
  if (activeGeneration == null) return null;
  if (!baseModel) return null;
  return modelsEqual(baseModel, rootModel) ? activeGeneration : null;
}

/** In-memory guest / reducer: append a new sensitivity pack. */
export function appendGuestGeneration(
  state: GuestWhatIfState,
  base: GuestWhatIfGeneration['base'],
  items: GuestWhatIfItem[],
): GuestWhatIfState {
  const generation = nextGenerationNumber(state.generations.map((g) => g.generation));
  return {
    generations: [
      ...state.generations,
      {
        generation,
        base: {
          model: cloneModel(base.model),
          result: base.result,
          solver_meta: base.solver_meta,
        },
        items: items.map((item) => ({
          title: item.title,
          mutation: item.mutation,
          model: cloneModel(item.model),
          result: item.result,
          solver_meta: item.solver_meta ?? null,
        })),
      },
    ],
    activeGeneration: generation,
  };
}

/** Solve without sensitivity → current empty slot. */
export function clearGuestActiveGeneration(state: GuestWhatIfState): GuestWhatIfState {
  return { ...state, activeGeneration: null };
}

/** Restore past generation → becomes current; return base for root. */
export function restoreGuestGeneration(
  state: GuestWhatIfState,
  generation: number,
): { state: GuestWhatIfState; base: GuestWhatIfGeneration['base'] } | null {
  const pack = state.generations.find((g) => g.generation === generation);
  if (!pack) return null;
  return {
    state: { ...state, activeGeneration: generation },
    base: {
      model: cloneModel(pack.base.model),
      result: pack.base.result,
      solver_meta: pack.base.solver_meta,
    },
  };
}

export function guestGenerationItems(
  state: GuestWhatIfState,
  generation: number,
): GuestWhatIfItem[] {
  return state.generations.find((g) => g.generation === generation)?.items ?? [];
}

export function emptyGuestWhatIfState(): GuestWhatIfState {
  return { generations: [], activeGeneration: null };
}

/** Stable key for duplicate detection (`kind` + `target` + `delta`). */
export function mutationKey(m: Mutation): string {
  return `${m.kind}:${m.target}:${m.delta}`;
}

export function mutationsEqual(a: Mutation, b: Mutation): boolean {
  return a.kind === b.kind && a.target === b.target && a.delta === b.delta;
}

/** True if any mutation in the list matches `m`. */
export function hasMutation(mutations: Array<Mutation | null | undefined>, m: Mutation): boolean {
  return mutations.some((x) => x != null && mutationsEqual(x, m));
}

/**
 * Append one interactive sensitivity row into guest state.
 * - No active gen → new generation with `base` + this item (first table row).
 * - Active gen → push into that gen's items (caller should guard duplicates).
 */
export function appendGuestSensitivityItem(
  state: GuestWhatIfState,
  base: GuestWhatIfGeneration['base'],
  item: GuestWhatIfItem,
): GuestWhatIfState {
  const clonedItem: GuestWhatIfItem = {
    title: item.title,
    mutation: { ...item.mutation },
    model: cloneModel(item.model),
    result: item.result,
    solver_meta: item.solver_meta ?? null,
  };

  if (state.activeGeneration == null) {
    return appendGuestGeneration(state, base, [clonedItem]);
  }

  const genIdx = state.generations.findIndex((g) => g.generation === state.activeGeneration);
  if (genIdx < 0) {
    return appendGuestGeneration(state, base, [clonedItem]);
  }

  const generations = state.generations.map((g, i) =>
    i === genIdx ? { ...g, items: [...g.items, clonedItem] } : g,
  );
  return { ...state, generations };
}
