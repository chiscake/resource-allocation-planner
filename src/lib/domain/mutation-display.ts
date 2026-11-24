import { formatPlanNumber } from '$lib/display/formatNumber';
import { applyMutation } from './mutations';
import type { Model, Mutation, MutationKind } from './types';

function fmt(n: number): string {
  return formatPlanNumber(n);
}

const KIND_ORDER: Record<MutationKind, number> = {
  resource_change: 0,
  modernization: 1,
  price_change: 2,
};

export function mutationKindOrder(kind: MutationKind | undefined): number {
  if (!kind) return 99;
  return KIND_ORDER[kind] ?? 99;
}

/** Absolute before/after values for a mutation (sensitivity table). */
export function mutationBeforeAfter(
  base: Model,
  mutation: Mutation,
): { before: string; after: string } {
  switch (mutation.kind) {
    case 'resource_change': {
      const i = base.resources.indexOf(mutation.target);
      if (i < 0) return { before: '—', after: '—' };
      const before = base.b[i];
      return { before: fmt(before), after: fmt(before * (1 + mutation.delta)) };
    }
    case 'price_change': {
      const j = base.products.indexOf(mutation.target);
      if (j < 0) return { before: '—', after: '—' };
      const before = base.c[j];
      return { before: fmt(before), after: fmt(before * (1 + mutation.delta)) };
    }
    case 'modernization': {
      const factor = 1 + mutation.delta;
      return {
        before: 'A',
        after: `A×${fmt(factor)}`,
      };
    }
    default:
      return { before: '—', after: '—' };
  }
}

/** Derive was/became from the already-mutated model (e.g. sensitivity child row). */
export function mutationBeforeAfterFromMutated(
  mutated: Model,
  mutation: Mutation,
): { before: string; after: string } {
  const d = mutation.delta;
  if (mutation.kind === 'modernization') {
    return {
      before: 'A',
      after: `A×${fmt(1 + d)}`,
    };
  }
  if (Math.abs(1 + d) < 1e-12) return { before: '—', after: '—' };
  switch (mutation.kind) {
    case 'resource_change': {
      const i = mutated.resources.indexOf(mutation.target);
      if (i < 0) return { before: '—', after: '—' };
      const after = mutated.b[i];
      return { before: fmt(after / (1 + d)), after: fmt(after) };
    }
    case 'price_change': {
      const j = mutated.products.indexOf(mutation.target);
      if (j < 0) return { before: '—', after: '—' };
      const after = mutated.c[j];
      return { before: fmt(after / (1 + d)), after: fmt(after) };
    }
    default:
      return { before: '—', after: '—' };
  }
}

export function mutatedModel(base: Model, mutation: Mutation): Model {
  return applyMutation(base, mutation);
}
