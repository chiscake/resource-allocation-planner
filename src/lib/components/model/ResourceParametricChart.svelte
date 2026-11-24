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
  const axisTitle = $derived(labeledResource(model, resourceIndex));

  function onResourceChange(e: Event) {
    const v = Number((e.currentTarget as HTMLSelectElement).value);
    resourceIndex = Number.isFinite(v) ? v : 0;
  }

  /** Extra bottom room for x tick numbers + axis title. */
  const pad = { top: 20, right: 16, bottom: 52, left: 52 };
  const viewW = 640;
  const viewH = 256;
  const plotW = viewW - pad.left - pad.right;
  const plotH = viewH - pad.top - pad.bottom;

  /** Approx. label half-width in viewBox px; ~30px on a 400px-wide render. */
  const LABEL_CLOSE_PX = 48;

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

  const xTicks = $derived(
    Array.from({ length: 5 }, (_, i) => bounds.xMin + ((bounds.xMax - bounds.xMin) * i) / 4),
  );

  type ChartMarker = {
    id: string;
    kind: 'bound' | 'current';
    value: number;
    x: number;
    label: string;
    title: string;
    labelY: number;
    labelX: number;
    labelAnchor: 'start' | 'end';
  };

  const markers = $derived.by((): ChartMarker[] => {
    if (!row) return [];
    const list: Omit<ChartMarker, 'x' | 'labelY' | 'labelX' | 'labelAnchor'>[] = [];
    if (Number.isFinite(row.lower)) {
      const value = row.lower;
      list.push({
        id: 'lower',
        kind: 'bound',
        value,
        label: formatSensitivityNumber(value),
        title: `${t('sensitivityLegendBounds')}: ${formatSensitivityNumber(value)}`,
      });
    }
    if (Number.isFinite(row.upper)) {
      const value = row.upper;
      list.push({
        id: 'upper',
        kind: 'bound',
        value,
        label: formatSensitivityNumber(value),
        title: `${t('sensitivityLegendBounds')}: ${formatSensitivityNumber(value)}`,
      });
    }
    {
      const value = row.current;
      list.push({
        id: 'current',
        kind: 'current',
        value,
        label: `${t('sensitivityCurrentStock')} ${formatSensitivityNumber(value)}`,
        title: `${t('sensitivityLegendCurrent')}: ${formatSensitivityNumber(value)}`,
      });
    }

    const sorted = list.map((m) => ({ ...m, x: xScale(m.value) })).sort((a, b) => a.x - b.x);

    let lastX = -Infinity;
    let stagger = 0;
    const rightEdge = viewW - pad.right - 4;
    return sorted.map((m) => {
      if (m.x - lastX < LABEL_CLOSE_PX) {
        stagger += 1;
      } else {
        stagger = 0;
      }
      lastX = m.x;
      // Prefer label to the right of the line; flip near the right edge.
      const nearRight = m.x > rightEdge - 56;
      return {
        ...m,
        labelY: pad.top + 10 + stagger * 12,
        labelX: nearRight ? m.x - 3 : m.x + 3,
        labelAnchor: (nearRight ? 'end' : 'start') as 'start' | 'end',
      };
    });
  });
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
        class="h-auto w-full min-w-0 text-text"
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

        <!-- X axis baseline + ticks -->
        <line
          x1={pad.left}
          x2={viewW - pad.right}
          y1={pad.top + plotH}
          y2={pad.top + plotH}
          class="stroke-border"
          stroke-width="1"
        />
        {#each xTicks as tick (tick)}
          <line
            x1={xScale(tick)}
            x2={xScale(tick)}
            y1={pad.top + plotH}
            y2={pad.top + plotH + 4}
            class="stroke-text-muted"
            stroke-width="1"
          />
          <text
            x={xScale(tick)}
            y={pad.top + plotH + 16}
            text-anchor="middle"
            class="fill-text-muted"
            font-size="10"
            font-family="ui-monospace, monospace"
          >
            {formatSensitivityNumber(tick)}
          </text>
        {/each}

        {#each markers as m (m.id)}
          <line
            x1={m.x}
            x2={m.x}
            y1={pad.top}
            y2={pad.top + plotH}
            class={m.kind === 'current' ? 'stroke-text' : 'stroke-brand'}
            stroke-width={m.kind === 'current' ? 1.5 : 1.25}
            stroke-dasharray={m.kind === 'bound' ? '4 3' : undefined}
          >
            <title>{m.title}</title>
          </line>
          <text
            x={m.labelX}
            y={m.labelY}
            text-anchor={m.labelAnchor}
            class={m.kind === 'current' ? 'fill-text' : 'fill-brand'}
            font-size="10"
            font-family="ui-monospace, monospace"
          >
            {m.label}
          </text>
        {/each}

        <path d={pathD} fill="none" class="stroke-brand" stroke-width="2" stroke-linejoin="round" />

        <text
          x={pad.left + plotW / 2}
          y={viewH - 6}
          text-anchor="middle"
          class="fill-text-muted"
          font-size="10"
        >
          {axisTitle}
        </text>
      </svg>
    </div>

    <ul
      class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted"
      aria-label={t('sensitivityParametricChart')}
    >
      <li class="flex items-center gap-1.5">
        <span class="inline-block h-0.5 w-4 rounded-sm bg-brand" aria-hidden="true"></span>
        <span>{t('sensitivityLegendZ')}</span>
      </li>
      <li class="flex items-center gap-1.5">
        <span class="inline-block h-3 w-0 border-l-[1.5px] border-text" aria-hidden="true"></span>
        <span>{t('sensitivityLegendCurrent')}</span>
      </li>
      <li class="flex items-center gap-1.5">
        <span class="inline-block h-3 w-0 border-l border-dashed border-brand" aria-hidden="true"
        ></span>
        <span>{t('sensitivityLegendBounds')}</span>
      </li>
    </ul>
  </div>
{/if}
