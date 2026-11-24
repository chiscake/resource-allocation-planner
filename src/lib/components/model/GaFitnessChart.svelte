<script lang="ts">
  import type { GaGenerationSnapshot } from '$lib/domain';
  import Card from '$lib/components/ui/Card.svelte';
  import { t } from '$lib/i18n';

  let {
    generations = [],
  }: {
    generations?: GaGenerationSnapshot[];
  } = $props();

  const points = $derived(
    generations.map((g) => ({
      generation: g.generation,
      best: g.bestFitness,
      avg: g.meanFitness,
      worst: g.worstFitness,
    })),
  );

  const pad = { top: 20, right: 24, bottom: 56, left: 84 };
  const viewW = 640;
  const viewH = 260;
  const WORST_EXPAND = 1.25;
  const clipId = 'ga-fitness-plot-clip';

  let hoverIndex = $state<number | null>(null);
  let hoverLocalX = $state<number | null>(null);
  let plotEl: HTMLDivElement | undefined = $state();
  let svgEl: SVGSVGElement | undefined = $state();

  const bounds = $derived.by(() => {
    if (points.length === 0) {
      return { xMin: 0, xMax: 1, yMin: 0, yMax: 1, worstClipped: false };
    }
    let coreMin = Infinity;
    let coreMax = -Infinity;
    let worstMin = Infinity;
    let worstMax = -Infinity;
    for (const p of points) {
      coreMin = Math.min(coreMin, p.best, p.avg);
      coreMax = Math.max(coreMax, p.best, p.avg);
      worstMin = Math.min(worstMin, p.worst);
      worstMax = Math.max(worstMax, p.worst);
    }
    let span = coreMax - coreMin;
    if (!(span > 1e-12)) {
      span = Math.max(Math.abs(coreMax) * 0.1, 0.5);
      coreMin -= span / 2;
      coreMax += span / 2;
    }
    const room = WORST_EXPAND * span;
    const yMinRaw = Math.min(coreMin, Math.max(worstMin, coreMin - room));
    const yMaxRaw = Math.max(coreMax, Math.min(worstMax, coreMax + room));
    const padY = span * 0.08;
    const yMin = yMinRaw - padY;
    const yMax = yMaxRaw;
    return {
      xMin: points[0].generation,
      xMax: Math.max(points[points.length - 1].generation, points[0].generation + 1),
      yMin,
      yMax,
      worstClipped: worstMin < yMin + 1e-9 || worstMax > yMax - 1e-9,
    };
  });

  const hoverPoint = $derived(hoverIndex != null && points[hoverIndex] ? points[hoverIndex] : null);

  const yTicks = $derived.by(() =>
    Array.from(
      { length: 5 },
      (_, index) => bounds.yMin + ((bounds.yMax - bounds.yMin) * index) / 4,
    ),
  );

  const xTicks = $derived.by(() => {
    const span = bounds.xMax - bounds.xMin;
    const step = Math.max(1, Math.round(span / 4));
    const ticks: number[] = [];
    for (let value = bounds.xMin; value <= bounds.xMax + 1e-9; value += step) {
      ticks.push(Math.round(value));
    }
    const last = Math.round(bounds.xMax);
    if (ticks[ticks.length - 1] !== last) ticks.push(last);
    return ticks;
  });

  function xScale(generation: number): number {
    const inner = viewW - pad.left - pad.right;
    return pad.left + ((generation - bounds.xMin) / (bounds.xMax - bounds.xMin || 1)) * inner;
  }

  function yScale(value: number): number {
    const inner = viewH - pad.top - pad.bottom;
    return pad.top + (1 - (value - bounds.yMin) / (bounds.yMax - bounds.yMin || 1)) * inner;
  }

  function yScaleClamped(value: number): number {
    return yScale(Math.min(bounds.yMax, Math.max(bounds.yMin, value)));
  }

  function linePath(key: 'best' | 'avg' | 'worst'): string {
    return points
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'}${xScale(p.generation).toFixed(2)} ${yScaleClamped(p[key]).toFixed(2)}`,
      )
      .join(' ');
  }

  function formatValue(value: number): string {
    const absolute = Math.abs(value);
    if (absolute >= 1000 || (absolute > 0 && absolute < 0.001)) {
      return value.toExponential(2);
    }
    if (absolute >= 100) return value.toFixed(1);
    return value.toFixed(4);
  }

  function clientToSvgX(clientX: number): number | null {
    if (!svgEl) return null;
    const matrix = svgEl.getScreenCTM();
    if (!matrix) return null;
    const inverse = matrix.inverse();
    return inverse.a * clientX + inverse.e;
  }

  function nearestIndex(clientX: number): number | null {
    if (points.length === 0) return null;
    const localX = clientToSvgX(clientX);
    if (localX == null || localX < pad.left || localX > viewW - pad.right) {
      return null;
    }
    const generation =
      bounds.xMin +
      ((localX - pad.left) / (viewW - pad.left - pad.right)) * (bounds.xMax - bounds.xMin);
    let nearest = 0;
    let distance = Infinity;
    for (let index = 0; index < points.length; index++) {
      const nextDistance = Math.abs(points[index].generation - generation);
      if (nextDistance < distance) {
        nearest = index;
        distance = nextDistance;
      }
    }
    return nearest;
  }

  function onPointerMove(event: PointerEvent): void {
    const localX = clientToSvgX(event.clientX);
    hoverIndex = nearestIndex(event.clientX);
    hoverLocalX = hoverIndex != null && localX != null ? localX : null;
  }

  function onPointerLeave(): void {
    hoverIndex = null;
    hoverLocalX = null;
  }

  const tooltipStyle = $derived.by(() => {
    if (!hoverPoint || hoverLocalX == null || !plotEl || !svgEl) return '';
    const matrix = svgEl.getScreenCTM();
    if (!matrix) return '';
    const x = matrix.a * hoverLocalX + matrix.e - plotEl.getBoundingClientRect().left;
    const width = plotEl.getBoundingClientRect().width;
    const flip = x > width * 0.62;
    return `left:${x + (flip ? -8 : 8)}px;top:12px;transform:translateX(${flip ? '-100%' : '0'});`;
  });
</script>

<Card>
  <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
    <div>
      <p class="text-sm font-medium text-text">{t('gaFitnessTitle')}</p>
      {#if bounds.worstClipped}
        <p class="mt-0.5 text-xs text-text-soft">{t('gaFitnessWorstClipped')}</p>
      {/if}
    </div>
    <div class="flex flex-wrap gap-3 text-xs text-text-muted">
      <span class="inline-flex items-center gap-1.5">
        <span class="inline-block h-0.5 w-4 bg-[#22C55E]"></span>
        {t('gaFitnessBest')}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="inline-block h-0.5 w-4 bg-[#3B82F6]"></span>
        {t('gaFitnessMean')}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="inline-block h-0.5 w-4 bg-[#EF4444]"></span>
        {t('gaFitnessWorst')}
      </span>
    </div>
  </div>
  {#if points.length === 0}
    <p class="py-6 text-center text-sm text-text-muted">—</p>
  {:else}
    <div
      bind:this={plotEl}
      class="relative w-full touch-none"
      onpointermove={onPointerMove}
      onpointerleave={onPointerLeave}
      role="img"
      aria-label={t('gaFitnessTitle')}
    >
      <svg
        bind:this={svgEl}
        class="block w-full"
        viewBox={`0 0 ${viewW} ${viewH}`}
        style:height={`${viewH}px`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={pad.left}
              y={pad.top}
              width={viewW - pad.left - pad.right}
              height={viewH - pad.top - pad.bottom}
            />
          </clipPath>
        </defs>

        {#each yTicks as tick (tick)}
          <line
            x1={pad.left}
            x2={viewW - pad.right}
            y1={yScale(tick)}
            y2={yScale(tick)}
            stroke="currentColor"
            stroke-opacity="0.08"
          />
          <text
            x={pad.left - 12}
            y={yScale(tick)}
            text-anchor="end"
            dominant-baseline="middle"
            class="fill-text-muted"
            font-size="10"
          >
            {formatValue(tick)}
          </text>
        {/each}

        {#each xTicks as tick (tick)}
          <line
            x1={xScale(tick)}
            x2={xScale(tick)}
            y1={pad.top}
            y2={viewH - pad.bottom}
            stroke="currentColor"
            stroke-opacity="0.045"
          />
          <text
            x={xScale(tick)}
            y={viewH - 28}
            text-anchor="middle"
            class="fill-text-muted"
            font-size="10"
          >
            {tick}
          </text>
        {/each}

        <line
          x1={pad.left}
          x2={viewW - pad.right}
          y1={viewH - pad.bottom}
          y2={viewH - pad.bottom}
          stroke="currentColor"
          stroke-opacity="0.2"
        />
        <line
          x1={pad.left}
          x2={pad.left}
          y1={pad.top}
          y2={viewH - pad.bottom}
          stroke="currentColor"
          stroke-opacity="0.2"
        />

        <text
          x={(pad.left + viewW - pad.right) / 2}
          y={viewH - 9}
          text-anchor="middle"
          class="fill-text-soft"
          font-size="11"
        >
          {t('gaFitnessGenerationAxis')}
        </text>
        <text
          x={14}
          y={viewH / 2}
          text-anchor="middle"
          class="fill-text-soft"
          font-size="11"
          transform={`rotate(-90 14 ${viewH / 2})`}
        >
          {t('gaFitnessAxis')}
        </text>

        <g clip-path={`url(#${clipId})`}>
          <path d={linePath('worst')} fill="none" stroke="#EF4444" stroke-width="1.75" />
          <path d={linePath('avg')} fill="none" stroke="#3B82F6" stroke-width="1.75" />
          <path d={linePath('best')} fill="none" stroke="#22C55E" stroke-width="2.25" />

          {#if hoverPoint && hoverLocalX != null}
            {@const markerX = xScale(hoverPoint.generation)}
            <line
              x1={hoverLocalX}
              x2={hoverLocalX}
              y1={pad.top}
              y2={viewH - pad.bottom}
              stroke="currentColor"
              stroke-opacity="0.28"
              stroke-dasharray="4 3"
            />
            <circle
              cx={markerX}
              cy={yScaleClamped(hoverPoint.worst)}
              r="3.5"
              fill="#EF4444"
              stroke="white"
              stroke-width="1.25"
            />
            <circle
              cx={markerX}
              cy={yScaleClamped(hoverPoint.avg)}
              r="3.5"
              fill="#3B82F6"
              stroke="white"
              stroke-width="1.25"
            />
            <circle
              cx={markerX}
              cy={yScaleClamped(hoverPoint.best)}
              r="3.5"
              fill="#22C55E"
              stroke="white"
              stroke-width="1.25"
            />
          {/if}
        </g>
      </svg>

      {#if hoverPoint}
        <div
          class="pointer-events-none absolute z-10 min-w-40 rounded-md border border-border bg-bg px-2.5 py-2 text-xs shadow-lg"
          style={tooltipStyle}
        >
          <p class="mb-1 font-medium text-text">
            {t('gaFitnessGeneration')}
            {hoverPoint.generation}
          </p>
          <p class="flex items-center justify-between gap-4">
            <span class="text-[#15803D]">{t('gaFitnessBest')}</span>
            <span class="font-mono text-text">{formatValue(hoverPoint.best)}</span>
          </p>
          <p class="flex items-center justify-between gap-4">
            <span class="text-[#2563EB]">{t('gaFitnessMean')}</span>
            <span class="font-mono text-text">{formatValue(hoverPoint.avg)}</span>
          </p>
          <p class="flex items-center justify-between gap-4">
            <span class="text-[#B91C1C]">{t('gaFitnessWorst')}</span>
            <span class="font-mono text-text">{formatValue(hoverPoint.worst)}</span>
          </p>
        </div>
      {/if}
    </div>
  {/if}
</Card>
