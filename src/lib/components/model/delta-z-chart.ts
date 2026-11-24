import type { Mutation, WhatIfRowData } from '$lib/domain';
import { formatMutationDeltaPct } from '$lib/domain/mutations';

/** Compact axis / bar label; full title stays in tooltip. */
export function shortDeltaZLabel(row: WhatIfRowData): string {
  const m = row.mutation as Mutation | undefined;
  if (!m?.kind) {
    const t = row.title ?? '';
    return t.length > 18 ? `${t.slice(0, 16)}…` : t;
  }
  const d = formatMutationDeltaPct(m.delta);
  const name = m.target;
  switch (m.kind) {
    case 'resource_change':
      return `${name} ${d}`;
    case 'modernization':
      return `Расход: ${name}`;
    case 'price_change':
      return `Цена: ${name} ${d}`;
    default:
      return row.title;
  }
}

/** Nice number (1/2/5×10^k). `round` picks a tighter step for tick spacing. */
function niceNum(value: number, round: boolean): number {
  const v = Math.max(Math.abs(value), 1e-12);
  const exp = Math.floor(Math.log10(v));
  const f = v / Math.pow(10, exp);
  let nf: number;
  if (round) {
    if (f < 1.5) nf = 1;
    else if (f < 3) nf = 2;
    else if (f < 7) nf = 5;
    else nf = 10;
  } else {
    if (f <= 1) nf = 1;
    else if (f <= 2) nf = 2;
    else if (f <= 5) nf = 5;
    else nf = 10;
  }
  return nf * Math.pow(10, exp);
}

/**
 * Nice scale covering [dataMin, dataMax] (and 0) with round ticks.
 * Example: ±18 → roughly −20…20 with step 10.
 */
export function niceDeltaZScale(
  dataMin: number,
  dataMax: number,
  approxTicks = 5,
): { min: number; max: number; ticks: number[] } {
  let lo = Math.min(dataMin, 0);
  let hi = Math.max(dataMax, 0);
  if (!(Number.isFinite(lo) && Number.isFinite(hi))) {
    return { min: -1, max: 1, ticks: [-1, 0, 1] };
  }
  // Light pad from the larger |extreme| so bars don't kiss the frame.
  const pad = Math.max(Math.abs(lo), Math.abs(hi), 1) * 0.05;
  lo -= pad;
  hi += pad;

  const step = niceNum((hi - lo) / Math.max(1, approxTicks - 1), true);

  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  // Guard against float drift.
  for (let v = min; v <= max + step * 1e-9; v = Math.round((v + step) * 1e12) / 1e12) {
    ticks.push(Object.is(v, -0) ? 0 : v);
  }
  if (!ticks.includes(0) && min < 0 && max > 0) {
    ticks.push(0);
    ticks.sort((a, b) => a - b);
  }
  return { min, max, ticks };
}
