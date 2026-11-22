import type { Model } from '$lib/domain/types';

/** Trim; empty / whitespace → "". */
export function trimUnit(unit: string | undefined | null): string {
  return (unit ?? '').trim();
}

/** `"a/b"` only when both sides are non-empty; otherwise "". */
export function joinUnit(
  numerator: string | undefined | null,
  denominator: string | undefined | null,
): string {
  const a = trimUnit(numerator);
  const b = trimUnit(denominator);
  return a && b ? `${a}/${b}` : '';
}

/** Display label: `Name (unit)` or bare name when unit is empty. */
export function labeledName(name: string, unit: string | undefined | null): string {
  const u = trimUnit(unit);
  return u ? `${name} (${u})` : name;
}

export function objectiveUnit(model: Model | null | undefined): string {
  return trimUnit(model?.objective_unit);
}

export function productUnit(model: Model | null | undefined, indexOrName: number | string): string {
  if (!model) return '';
  const j =
    typeof indexOrName === 'number' ? indexOrName : (model.products?.indexOf(indexOrName) ?? -1);
  if (j < 0) return '';
  return trimUnit(model.product_units?.[j]);
}

export function resourceUnit(
  model: Model | null | undefined,
  indexOrName: number | string,
): string {
  if (!model) return '';
  const i =
    typeof indexOrName === 'number' ? indexOrName : (model.resources?.indexOf(indexOrName) ?? -1);
  if (i < 0) return '';
  return trimUnit(model.resource_units?.[i]);
}

export function labeledProduct(
  model: Model | null | undefined,
  indexOrName: number | string,
): string {
  const name =
    typeof indexOrName === 'number' ? (model?.products?.[indexOrName] ?? '') : indexOrName;
  return labeledName(name, productUnit(model, indexOrName));
}

export function labeledResource(
  model: Model | null | undefined,
  indexOrName: number | string,
): string {
  const name =
    typeof indexOrName === 'number' ? (model?.resources?.[indexOrName] ?? '') : indexOrName;
  return labeledName(name, resourceUnit(model, indexOrName));
}

/** Price / profit per product: objective / product. */
export function priceUnit(model: Model | null | undefined, indexOrName: number | string): string {
  return joinUnit(objectiveUnit(model), productUnit(model, indexOrName));
}

/** Shadow price of a resource: objective / resource. */
export function shadowUnit(model: Model | null | undefined, indexOrName: number | string): string {
  return joinUnit(objectiveUnit(model), resourceUnit(model, indexOrName));
}

/** A[i][j] consumption: resource / product. */
export function coeffUnit(
  model: Model | null | undefined,
  resourceIndex: number,
  productIndex: number,
): string {
  return joinUnit(resourceUnit(model, resourceIndex), productUnit(model, productIndex));
}
