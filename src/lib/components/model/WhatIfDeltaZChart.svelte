<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import type { WhatIfRowData } from '$lib/domain';
  import { formatSensitivityNumber } from './format-plan-number';
  import { niceDeltaZScale, shortDeltaZLabel } from './delta-z-chart';

  let {
    rows,
  }: {
    rows: WhatIfRowData[];
  } = $props();

  /** Horizontal bars below this CSS width (portrait phone / narrow). */
  const HORIZONTAL_MQ = '(max-width: 640px)';
  let horizontal = $state(false);

  onMount(() => {
    const mq = window.matchMedia(HORIZONTAL_MQ);
    const apply = () => {
      horizontal = mq.matches;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  });

  const points = $derived(
    rows.map((r, i) => ({
      i,
      title: r.title,
      short: shortDeltaZLabel(r),
      deltaZ: Number.isFinite(r.deltaZ) ? r.deltaZ : 0,
      basisChanged: r.basisChanged,
    })),
  );

  const scale = $derived.by(() => {
    if (points.length === 0) return niceDeltaZScale(-1, 1);
    let min = 0;
    let max = 0;
    for (const p of points) {
      min = Math.min(min, p.deltaZ);
      max = Math.max(max, p.deltaZ);
    }
    return niceDeltaZScale(min, max, 5);
  });

  // ——— Vertical layout (tablet landscape / desktop) ———
  const vPad = { top: 20, right: 14, bottom: 0, left: 48 };
  const vViewW = 720;
  /** Degrees; negative = CCW → end-anchored labels slant down-left into the margin. */
  const vLabelAngle = -48;
  const vMaxLabelChars = $derived(points.reduce((m, p) => Math.max(m, p.short.length), 0));
  // Pivot sits just under the plot; text extends downward into this margin.
  // ≈5.6 viewBox units per char at font 9; use |sin(angle)| for vertical span.
  const vBottom = $derived(
    Math.ceil(16 + vMaxLabelChars * 5.6 * Math.sin((Math.abs(vLabelAngle) * Math.PI) / 180) + 10),
  );
  const vViewH = $derived(220 + vBottom);
  const vPlotW = vViewW - vPad.left - vPad.right;
  const vPlotH = $derived(vViewH - vPad.top - vBottom);
  /** Baseline for rotated X labels (top of bottom margin). */
  const vLabelY = $derived(vPad.top + vPlotH + 12);

  function vY(v: number): number {
    const t01 = (v - scale.min) / (scale.max - scale.min || 1);
    return vPad.top + vPlotH * (1 - t01);
  }
  function vBarX(i: number): number {
    const gap = vPlotW / Math.max(1, points.length);
    return vPad.left + gap * i + gap * 0.12;
  }
  function vBarW(): number {
    return (vPlotW / Math.max(1, points.length)) * 0.76;
  }
  const vZeroY = $derived(vY(0));

  // ——— Horizontal layout (narrow) ———
  const hPad = { top: 12, right: 48, bottom: 28, left: 0 };
  const hViewW = 400;
  const hRowH = 22;
  const hLabelW = 118;
  const hViewH = $derived(hPad.top + hPad.bottom + points.length * hRowH);
  const hPlotX0 = hPad.left + hLabelW;
  const hPlotW = hViewW - hPlotX0 - hPad.right;

  function hX(v: number): number {
    const t01 = (v - scale.min) / (scale.max - scale.min || 1);
    return hPlotX0 + t01 * hPlotW;
  }
  const hZeroX = $derived(hX(0));
</script>

{#if points.length}
  <div>
    <p class="mb-2 text-xs font-medium text-text-muted">{t('sensitivityDeltaZChart')}</p>
    <div class="overflow-x-auto">
      {#if horizontal}
        <svg
          viewBox="0 0 {hViewW} {hViewH}"
          class="h-auto w-full min-w-0 text-text"
          role="img"
          aria-label={t('sensitivityDeltaZChart')}
        >
          {#each scale.ticks as tick (tick)}
            <line
              x1={hX(tick)}
              x2={hX(tick)}
              y1={hPad.top}
              y2={hViewH - hPad.bottom}
              class="stroke-border"
              stroke-width="1"
            />
          {/each}
          <line
            x1={hZeroX}
            x2={hZeroX}
            y1={hPad.top}
            y2={hViewH - hPad.bottom}
            class="stroke-text-muted"
            stroke-width="1.25"
          />

          {#each points as p (p.i)}
            {@const cy = hPad.top + p.i * hRowH + hRowH / 2}
            {@const x0 = Math.min(hX(p.deltaZ), hZeroX)}
            {@const x1 = Math.max(hX(p.deltaZ), hZeroX)}
            <text
              x={hLabelW - 6}
              y={cy + 3}
              text-anchor="end"
              class="fill-text-muted"
              font-size="9"
            >
              <title>{p.title}</title>
              {p.short}
            </text>
            <rect
              x={x0}
              y={cy - 6}
              width={Math.max(x1 - x0, 1)}
              height={12}
              class={p.basisChanged ? 'fill-danger-text/80' : 'fill-brand'}
              rx="2"
            >
              <title>{p.title}: ΔZ = {formatSensitivityNumber(p.deltaZ)}</title>
            </rect>
            <text
              x={p.deltaZ >= 0 ? x1 + 3 : x0 - 3}
              y={cy + 3}
              text-anchor={p.deltaZ >= 0 ? 'start' : 'end'}
              class="fill-text-muted"
              font-size="8"
              font-family="ui-monospace, monospace"
            >
              {formatSensitivityNumber(p.deltaZ)}
            </text>
          {/each}

          {#each scale.ticks as tick (tick)}
            <text
              x={hX(tick)}
              y={hViewH - 6}
              text-anchor="middle"
              class="fill-text-muted"
              font-size="9"
              font-family="ui-monospace, monospace"
            >
              {formatSensitivityNumber(tick)}
            </text>
          {/each}
        </svg>
      {:else}
        <svg
          viewBox="0 0 {vViewW} {vViewH}"
          class="h-auto w-full min-w-0 text-text"
          role="img"
          aria-label={t('sensitivityDeltaZChart')}
        >
          {#each scale.ticks as tick (tick)}
            <line
              x1={vPad.left}
              x2={vViewW - vPad.right}
              y1={vY(tick)}
              y2={vY(tick)}
              class="stroke-border"
              stroke-width="1"
            />
            <text
              x={vPad.left - 6}
              y={vY(tick) + 3}
              text-anchor="end"
              class="fill-text-muted"
              font-size="10"
              font-family="ui-monospace, monospace"
            >
              {formatSensitivityNumber(tick)}
            </text>
          {/each}

          <line
            x1={vPad.left}
            x2={vViewW - vPad.right}
            y1={vZeroY}
            y2={vZeroY}
            class="stroke-text-muted"
            stroke-width="1.25"
          />

          {#each points as p (p.i)}
            {@const x = vBarX(p.i)}
            {@const y = Math.min(vY(p.deltaZ), vZeroY)}
            {@const h = Math.abs(vY(p.deltaZ) - vZeroY)}
            {@const cx = x + vBarW() / 2}
            <rect
              {x}
              {y}
              width={vBarW()}
              height={Math.max(h, 1)}
              class={p.basisChanged ? 'fill-danger-text/80' : 'fill-brand'}
              rx="2"
            >
              <title>{p.title}: ΔZ = {formatSensitivityNumber(p.deltaZ)}</title>
            </rect>
            <text
              x={cx}
              y={vLabelY}
              text-anchor="end"
              transform="rotate({vLabelAngle} {cx} {vLabelY})"
              class="fill-text-muted"
              font-size="9"
            >
              <title>{p.title}</title>
              {p.short}
            </text>
            {#if Math.abs(p.deltaZ) >= 0.005}
              <text
                x={cx}
                y={p.deltaZ >= 0 ? y - 4 : y + h + 10}
                text-anchor="middle"
                class="fill-text-muted"
                font-size="8"
                font-family="ui-monospace, monospace"
              >
                {formatSensitivityNumber(p.deltaZ)}
              </text>
            {/if}
          {/each}
        </svg>
      {/if}
    </div>
  </div>
{/if}
