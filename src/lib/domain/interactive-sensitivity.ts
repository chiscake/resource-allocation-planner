import type { Model, Mutation, MutationKind, SolveMethod, WhatIfDefaults } from './types';
import { formatMutationLabel } from './mutations';

export const INTERACTIVE_DELTA_PCT_MIN = -50;
export const INTERACTIVE_DELTA_PCT_MAX = 50;
export const INTERACTIVE_PREVIEW_DEBOUNCE_MS = 350;

/** Clamp integer percent for the interactive slider / input. */
export function clampDeltaPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.max(INTERACTIVE_DELTA_PCT_MIN, Math.min(INTERACTIVE_DELTA_PCT_MAX, Math.round(pct)));
}

/**
 * Seed δ% from model defaults when the mutation kind changes.
 * Missing/invalid default → Task-13-ish fallbacks (+10 / −10 / +15).
 */
export function seedDeltaPct(kind: MutationKind, defaults?: WhatIfDefaults | null): number {
  const frac = (v: number | null | undefined): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

  switch (kind) {
    case 'resource_change': {
      const p = frac(defaults?.resource_pct);
      return clampDeltaPct(p != null ? p * 100 : 10);
    }
    case 'modernization': {
      const p = frac(defaults?.modernization_pct);
      return clampDeltaPct(p != null ? -(p * 100) : -10);
    }
    case 'price_change': {
      const p = frac(defaults?.price_pct);
      return clampDeltaPct(p != null ? p * 100 : 15);
    }
    default:
      return 0;
  }
}

export function targetsForKind(model: Model, kind: MutationKind): string[] {
  return kind === 'resource_change' ? [...model.resources] : [...model.products];
}

/** LP/IPM auto-preview; GA/DLN need an explicit recalc. */
export function interactiveAutoPreview(method: SolveMethod): boolean {
  return method === 'lp' || method === 'ipm';
}

export function pctToDelta(pct: number): number {
  return clampDeltaPct(pct) / 100;
}

export function buildInteractiveMutation(
  kind: MutationKind,
  target: string,
  deltaPct: number,
  model?: Model,
): Mutation {
  const delta = pctToDelta(deltaPct);
  const mutation: Mutation = { kind, target, delta };
  mutation.label = formatMutationLabel(mutation, model);
  return mutation;
}
