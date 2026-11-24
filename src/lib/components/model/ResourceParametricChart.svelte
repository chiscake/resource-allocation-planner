<script lang="ts">
  import { t } from '$lib/i18n';
  import type { Model } from '$lib/domain';
  import { labeledResource } from '$lib/display/units';
  import { computeSensitivityRanges, sampleZVsResource } from '$lib/solver';
  import { formatSensitivityNumber } from './format-plan-number';

  let {
    model,
  }: {
    model: Model;
  } = $props();

  let resourceIndex = $state(0);

  const ranges = $derived(computeSensitivityRanges(model));
  const row = $derived(ranges?.rhs[resourceIndex] ?? null);
  const samples = $derived(sampleZVsResource(model, resourceIndex, { points: 49, padRatio: 0.2 }));

  function onResourceChange(e: Event) {
    const v = Number((e.currentTarget as HTMLSelectElement).value);
    resourceIndex = Number.isFinite(v) ? v : 0;
  }

  const pad = { top: 16, right: 16, bottom: 36, left: 52 };
  const viewW = 640;
  const viewH = 240;
  const plotW = viewW - pad.left - pad.right;
  const plotH = viewH - pad.top - pad.bottom;

  const bounds = $derived.by(() => {
    const finite = samples.filter((s) => Number.isFinite(s.Z));
    if (finite.length === 0) {
      return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    }
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const s of finite) {
      xMin = Math.min(xMin, s.b);
      xMax = Math.max(xMax, s.b);
      yMin = Math.min(yMin, s.Z);
      yMax = Math.max(yMax, s.Z);
    }
    if (xMax - xMin < 1e-9) {
      xMin -= 1;
      xMax += 1;
    }
    if (yMax - yMin < 1e-9) {
      yMin -= 1;
      yMax += 1;
    }
    const px = (xMax - xMin) * 0.04;
    const py = (yMax - yMin) * 0.08;
    return { xMin: xMin - px, xMax: xMax + px, yMin: yMin - py, yMax: yMax + py };
  });

  function xScale(b: number): number {
    return pad.left + ((b - bounds.xMin) / (bounds.xMax - bounds.xMin)) * plotW;
  }
  function yScale(z: number): number {
    return pad.top + (1 - (z - bounds.yMin) / (bounds.yMax - bounds.yMin)) * plotH;
  }

  const pathD = $derived.by(() => {
    const finite = samples.filter((s) => Number.isFinite(s.Z));
    if (finite.length === 0) return '';
    return finite
      .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xScale(s.b).toFixed(2)} ${yScale(s.Z).toFixed(2)}`)
      .join(' ');
  });

  const yTicks = $derived(
    Array.from({ length: 5 }, (_, i) => bounds.yMin + ((bounds.yMax - bounds.yMin) * i) / 4),
  );
</script>

{#if model.resources.length && samples.length}
  <div>
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-medium text-text-muted">{t('sensitivityParametricChart')}</p>
      <label class="flex items-center gap-2 text-xs text-text-muted">
        <span>{t('sensitivityParametricResource')}</span>
        <select
          class="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text"
          value={String(resourceIndex)}
          onchange={onResourceChange}
        >
          {#each model.resources as name, i (name)}
            <option value={String(i)}>{labeledResource(model, i)}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="overflow-x-auto">
      <svg
        viewBox="0 0 {viewW} {viewH}"
        class="h-auto w-full min-w-[28rem] text-text"
        role="img"
        aria-label={t('sensitivityParametricChart')}
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

        {#if row && Number.isFinite(row.lower)}
          <line
            x1={xScale(row.lower)}
            x2={xScale(row.lower)}
            y1={pad.top}
            y2={pad.top + plotH}
            class="stroke-brand"
            stroke-width="1.25"
            stroke-dasharray="4 3"
          >
            <title>{t('sensitivityIntervalMark')}: {formatSensitivityNumber(row.lower)}</title>
          </line>
        {/if}
        {#if row && Number.isFinite(row.upper)}
          <line
            x1={xScale(row.upper)}
            x2={xScale(row.upper)}
            y1={pad.top}
            y2={pad.top + plotH}
            class="stroke-brand"
            stroke-width="1.25"
            stroke-dasharray="4 3"
          >
            <title>{t('sensitivityIntervalMark')}: {formatSensitivityNumber(row.upper)}</title>
          </line>
        {/if}

        {#if row}
          <line
            x1={xScale(row.current)}
            x2={xScale(row.current)}
            y1={pad.top}
            y2={pad.top + plotH}
            class="stroke-text-muted"
            stroke-width="1"
          />
        {/if}

        <path d={pathD} fill="none" class="stroke-brand" stroke-width="2" stroke-linejoin="round" />

        <text
          x={pad.left + plotW / 2}
          y={viewH - 8}
          text-anchor="middle"
          class="fill-text-muted"
          font-size="10"
        >
          bᵢ
        </text>
      </svg>
    </div>
    <p class="mt-1 text-[11px] text-text-faint">
      {t('sensitivityIntervalMark')} — {t('sensitivityInsideInterval')} / {t(
        'sensitivityOutsideInterval',
      )}
    </p>
  </div>
{/if}
