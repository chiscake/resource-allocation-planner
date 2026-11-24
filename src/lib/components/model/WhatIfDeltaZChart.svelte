<script lang="ts">
  import { t } from '$lib/i18n';
  import type { WhatIfRowData } from '$lib/domain';
  import { formatSensitivityNumber } from './format-plan-number';

  let {
    rows,
  }: {
    rows: WhatIfRowData[];
  } = $props();

  const pad = { top: 16, right: 12, bottom: 72, left: 52 };
  const viewW = 640;
  const viewH = 260;
  const plotW = viewW - pad.left - pad.right;
  const plotH = viewH - pad.top - pad.bottom;

  const points = $derived(
    rows.map((r, i) => ({
      i,
      title: r.title,
      deltaZ: Number.isFinite(r.deltaZ) ? r.deltaZ : 0,
      basisChanged: r.basisChanged,
    })),
  );

  const yBound = $derived.by(() => {
    if (points.length === 0) return { min: -1, max: 1 };
    let min = 0;
    let max = 0;
    for (const p of points) {
      min = Math.min(min, p.deltaZ);
      max = Math.max(max, p.deltaZ);
    }
    if (Math.abs(max - min) < 1e-9) {
      min -= 1;
      max += 1;
    }
    const padY = (max - min) * 0.08;
    return { min: min - padY, max: max + padY };
  });

  function yScale(v: number): number {
    const t01 = (v - yBound.min) / (yBound.max - yBound.min);
    return pad.top + plotH * (1 - t01);
  }

  function barX(i: number): number {
    const gap = plotW / points.length;
    return pad.left + gap * i + gap * 0.15;
  }

  function barW(): number {
    if (points.length === 0) return 0;
    return (plotW / points.length) * 0.7;
  }

  const zeroY = $derived(yScale(0));
  const yTicks = $derived(
    Array.from({ length: 5 }, (_, i) => yBound.min + ((yBound.max - yBound.min) * i) / 4),
  );
</script>

{#if points.length}
  <div>
    <p class="mb-2 text-xs font-medium text-text-muted">{t('sensitivityDeltaZChart')}</p>
    <div class="overflow-x-auto">
      <svg
        viewBox="0 0 {viewW} {viewH}"
        class="h-auto w-full min-w-[28rem] text-text"
        role="img"
        aria-label={t('sensitivityDeltaZChart')}
      >
        {#each yTicks as tick (tick)}
          <line
            x1={pad.left}
            x2={viewW - pad.right}
            y1={yScale(tick)}
            y2={yScale(tick)}
            class="stroke-border"
            stroke-width="1"
          />
          <text
            x={pad.left - 6}
            y={yScale(tick) + 3}
            text-anchor="end"
            class="fill-text-muted"
            font-size="10"
            font-family="ui-monospace, monospace"
          >
            {formatSensitivityNumber(tick)}
          </text>
        {/each}

        <line
          x1={pad.left}
          x2={viewW - pad.right}
          y1={zeroY}
          y2={zeroY}
          class="stroke-text-muted"
          stroke-width="1.25"
        />

        {#each points as p (p.i)}
          {@const x = barX(p.i)}
          {@const y = Math.min(yScale(p.deltaZ), zeroY)}
          {@const h = Math.abs(yScale(p.deltaZ) - zeroY)}
          <rect
            {x}
            {y}
            width={barW()}
            height={Math.max(h, 1)}
            class={p.basisChanged ? 'fill-danger-text/80' : 'fill-brand'}
            rx="2"
          >
            <title>{p.title}: ΔZ = {formatSensitivityNumber(p.deltaZ)}</title>
          </rect>
          <text
            x={x + barW() / 2}
            y={viewH - 8}
            text-anchor="end"
            transform="rotate(-55 {x + barW() / 2} {viewH - 8})"
            class="fill-text-muted"
            font-size="8"
          >
            {p.title.length > 22 ? `${p.title.slice(0, 20)}…` : p.title}
          </text>
        {/each}
      </svg>
    </div>
  </div>
{/if}
