import type { Model, SolveResult } from './types';

/** Max tasks in one comparison (product UX). */
export const COMPARE_MAX_IDS = 4;

export const COMPARE_DELTA_EPS = 1e-9;

export type MatrixCompatSeverity = 'dimension' | 'names' | 'units';

export type NamedDelta = {
  name: string;
  delta: number;
  /** Relative % vs primary; null when |primary| ≤ ε. */
  pct: number | null;
};

export type PlanProductDelta = NamedDelta;

export type PlanDeltas = {
  deltaZ: number;
  pctZ: number | null;
  perProduct: NamedDelta[];
  onlyPrimary: string[];
  onlyOther: string[];
  perShadow: NamedDelta[];
  perSlack: NamedDelta[];
};

function unitAt(units: string[] | undefined, i: number): string {
  return units?.[i] ?? '';
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function unitsMatch(primary: Model, other: Model): boolean {
  if ((primary.objective_unit ?? '') !== (other.objective_unit ?? '')) return false;
  for (let i = 0; i < primary.products.length; i++) {
    if (unitAt(primary.product_units, i) !== unitAt(other.product_units, i)) return false;
  }
  for (let i = 0; i < primary.resources.length; i++) {
    if (unitAt(primary.resource_units, i) !== unitAt(other.resource_units, i)) return false;
  }
  return true;
}

/**
 * Highest-severity matrix mismatch vs primary, or null if headers/units align.
 * Order: dimension → names → units.
 */
export function assessMatrixCompatibility(
  primary: Model,
  other: Model,
): MatrixCompatSeverity | null {
  if (
    primary.products.length !== other.products.length ||
    primary.resources.length !== other.resources.length
  ) {
    return 'dimension';
  }
  if (
    !arraysEqual(primary.products, other.products) ||
    !arraysEqual(primary.resources, other.resources)
  ) {
    return 'names';
  }
  if (!unitsMatch(primary, other)) return 'units';
  return null;
}

function relativePct(value: number, primary: number, eps: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(primary)) return null;
  if (Math.abs(primary) <= eps) return null;
  return (100 * (value - primary)) / Math.abs(primary);
}

function namedDeltas(
  primaryMap: Record<string, number>,
  otherMap: Record<string, number>,
  eps: number,
): NamedDelta[] {
  const primaryNames = Object.keys(primaryMap);
  const otherSet = new Set(Object.keys(otherMap));
  return primaryNames
    .filter((n) => otherSet.has(n))
    .map((name) => {
      const pv = primaryMap[name] ?? 0;
      const ov = otherMap[name] ?? 0;
      return {
        name,
        delta: ov - pv,
        pct: relativePct(ov, pv, eps),
      };
    });
}

/** Signed Δ and % of plan/Z/shadows/slack for `other` relative to `primary`. */
export function planDeltas(
  primary: SolveResult,
  other: SolveResult,
  eps: number = COMPARE_DELTA_EPS,
): PlanDeltas {
  const deltaZ = other.Z - primary.Z;
  const pctZ = relativePct(other.Z, primary.Z, eps);

  const primaryNames = Object.keys(primary.x);
  const otherNames = Object.keys(other.x);
  const primarySet = new Set(primaryNames);
  const otherSet = new Set(otherNames);

  const perProduct = namedDeltas(primary.x, other.x, eps);
  const onlyPrimary = primaryNames.filter((n) => !otherSet.has(n));
  const onlyOther = otherNames.filter((n) => !primarySet.has(n));

  const perShadow = namedDeltas(primary.shadow_prices ?? {}, other.shadow_prices ?? {}, eps);
  const perSlack = namedDeltas(primary.resource_slack ?? {}, other.resource_slack ?? {}, eps);

  return { deltaZ, pctZ, perProduct, onlyPrimary, onlyOther, perShadow, perSlack };
}

/** Parse `?ids=` query: unique, primary first, capped at COMPARE_MAX_IDS. */
export function parseCompareIds(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= COMPARE_MAX_IDS) break;
  }
  return out;
}

export function formatCompareIds(ids: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const t = id.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= COMPARE_MAX_IDS) break;
  }
  return out.join(',');
}

/** Ordered uuid[] equality for comparisons.dedupe. */
export function nodeIdsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
