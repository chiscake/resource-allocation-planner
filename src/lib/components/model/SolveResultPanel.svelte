<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { ChevronDown } from '@lucide/svelte';
  import type { Model, SolveMethod, SolveResult, SolveTrace, WhatIfRowData } from '$lib/domain';
  import type { VerifyReport } from '$lib/solver/verify';
  import { labeledProduct, labeledResource, objectiveUnit, shadowUnit } from '$lib/display/units';
  import { t } from '$lib/i18n';
  import Card from '$lib/components/ui/Card.svelte';
  import { formatPlanNumber } from './format-plan-number';
  import SimplexStepsPanel from './SimplexStepsPanel.svelte';
  import GaStepsPanel from './GaStepsPanel.svelte';
  import LibraryVerifyPanel from './LibraryVerifyPanel.svelte';
  import GeometryPanel from './visualization/GeometryPanel.svelte';
  import ResultExportActions from './ResultExportActions.svelte';

  const ZERO_EPS = 1e-9;

  let {
    result,
    model = null,
    roundPlan = false,
    productOrder = undefined,
    resourceOrder = undefined,
    solverLibrary = null,
    trace = null,
    stepsAvailable = false,
    verifyReport = null,
    solveMethod = 'lp',
    gapVsLp = null,
    onRequestSteps,
    exportTitle = null,
    whatIfRows = [],
    children,
  }: {
    result: SolveResult;
    model?: Model | null;
    roundPlan?: boolean;
    productOrder?: string[];
    resourceOrder?: string[];
    solverLibrary?: string | null;
    trace?: SolveTrace | null;
    stepsAvailable?: boolean;
    verifyReport?: VerifyReport | null;
    solveMethod?: SolveMethod;
    gapVsLp?: number | null;
    onRequestSteps?: () => void;
    /** When set (with `model`), shows Excel / PDF export of this result. */
    exportTitle?: string | null;
    whatIfRows?: WhatIfRowData[];
    children?: Snippet;
  } = $props();

  let stepsRequested = $state(false);
  let stepsPreparing = $state(false);
  /** Content stays mounted after first open so collapse can animate. */
  let stepsMounted = $state(false);
  let stepsOpen = $state(false);

  let geometryMounted = $state(false);
  let geometryOpen = $state(false);

  const planEntries = $derived.by(() => {
    const keys = productOrder?.length ? productOrder : Object.keys(result.x);
    return keys.map((k) => [k, result.x[k] ?? 0] as [string, number]);
  });

  const criticalSet = $derived(new Set(result.critical_resources));

  const shadowEntries = $derived.by(() => {
    const prices = result.shadow_prices;
    if (!prices) return [] as [string, number][];
    const keys = resourceOrder?.length ? resourceOrder : Object.keys(prices);
    return keys.filter((k) => k in prices).map((k) => [k, prices[k] ?? 0] as [string, number]);
  });

  const slackEntries = $derived.by(() => {
    const slack = result.resource_slack;
    if (!slack) return [] as [string, number][];
    const keys = resourceOrder?.length ? resourceOrder : Object.keys(slack);
    return keys.filter((k) => k in slack).map((k) => [k, slack[k] ?? 0] as [string, number]);
  });

  const zUnit = $derived(objectiveUnit(model));

  function isZeroPlan(v: number): boolean {
    return !Number.isFinite(v) || Math.abs(v) < ZERO_EPS;
  }

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  async function onGeometryToggle() {
    if (geometryOpen) {
      geometryOpen = false;
      return;
    }
    if (!geometryMounted) {
      geometryMounted = true;
      await tick();
      await nextFrame();
    }
    geometryOpen = true;
  }

  async function onStepsToggle() {
    if (stepsOpen) {
      stepsOpen = false;
      return;
    }

    // Heavy sync regenerate must finish *before* expand, otherwise the main
    // thread freezes mid-transition and the section just pops in.
    if (!stepsRequested) {
      stepsRequested = true;
      stepsPreparing = true;
      await tick();
      await nextFrame();
      try {
        onRequestSteps?.();
      } finally {
        stepsPreparing = false;
      }
    }

    if (!stepsMounted) {
      stepsMounted = true;
      await tick();
      await nextFrame();
    }
    stepsOpen = true;
  }
</script>

<Card>
  <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span class="text-sm font-medium text-text-muted">{t('zMax')}</span>
      <span class="font-mono text-4xl font-semibold tabular-nums tracking-tight text-brand">
        {formatPlanNumber(result.Z)}
      </span>
      {#if zUnit}
        <span class="text-sm text-text-soft">{zUnit}</span>
      {/if}
    </div>
    {#if model && exportTitle != null}
      <ResultExportActions
        title={exportTitle}
        method={solveMethod}
        {result}
        {model}
        {whatIfRows}
        {roundPlan}
        {solverLibrary}
      />
    {/if}
  </div>

  {#if solverLibrary}
    <p class="mt-2 text-xs text-text-soft">
      {t('solverLibrary')}: {solverLibrary}
    </p>
  {/if}

  <div class="mt-6">
    <p class="mb-2 text-sm font-medium text-text">{t('guestPlan')}</p>

    {#if roundPlan && !result.feasible}
      <p class="mb-3 text-sm text-warning-text">{t('roundPlanInfeasible')}</p>
    {/if}

    <table class="w-full text-sm">
      <tbody>
        {#each planEntries as [name, value] (name)}
          <tr
            class="border-b border-border-soft last:border-0 {isZeroPlan(value)
              ? 'text-text-faint'
              : 'text-text'}"
          >
            <td class="py-1.5 pr-3">{labeledProduct(model, name)}</td>
            <td class="py-1.5 text-right font-mono tabular-nums">
              {formatPlanNumber(value)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if result.critical_resources.length}
    <div class="mt-6">
      <p class="mb-2 text-sm font-medium text-text">{t('criticalResources')}</p>
      <ul class="flex flex-col gap-1.5">
        {#each result.critical_resources as name (name)}
          <li class="text-sm text-text">{labeledResource(model, name)}</li>
        {/each}
      </ul>
    </div>
  {:else}
    <div class="mt-6">
      <p class="mb-1 text-sm font-medium text-text">{t('criticalResources')}</p>
      <p class="text-sm text-text-muted">—</p>
    </div>
  {/if}

  {#if shadowEntries.length}
    <div class="mt-6">
      <p class="mb-2 text-sm font-medium text-text">{t('shadowPrices')}</p>
      <table class="w-full text-sm">
        <tbody>
          {#each shadowEntries as [name, value] (name)}
            <tr class="border-b border-border-soft last:border-0">
              <td class="py-1.5 pr-3 {criticalSet.has(name) ? 'text-text' : 'text-text-muted'}">
                {labeledResource(model, name)}
              </td>
              <td class="py-1.5 text-right font-mono tabular-nums text-text">
                {formatPlanNumber(value)}
              </td>
              <td class="w-0 whitespace-nowrap py-1.5 pl-2 text-xs text-text-soft">
                {shadowUnit(model, name)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if slackEntries.length}
    <div class="mt-6">
      <p class="mb-2 text-sm font-medium text-text">{t('resourceSlack')}</p>
      <table class="w-full text-sm">
        <tbody>
          {#each slackEntries as [name, value] (name)}
            <tr class="border-b border-border-soft last:border-0">
              <td class="py-1.5 pr-3 text-text-muted">
                {labeledResource(model, name)}
              </td>
              <td class="py-1.5 text-right font-mono tabular-nums text-text">
                {formatPlanNumber(value)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if model && solveMethod === 'lp' && stepsAvailable}
    <div class="mt-6">
      <div class="flex items-center gap-3">
        <span class="h-px min-w-4 flex-1 bg-border" aria-hidden="true"></span>
        <button
          type="button"
          class="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-soft transition-colors duration-200 hover:bg-bg-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          aria-expanded={geometryOpen}
          onclick={onGeometryToggle}
        >
          <span>
            {geometryOpen ? t('geometryToggleHide') : t('geometryToggle')}
          </span>
          <ChevronDown
            class={[
              'size-3.5 shrink-0 transition-transform duration-[320ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
              geometryOpen && 'rotate-180',
              prefersReducedMotion.current && 'transition-none',
            ]}
            aria-hidden="true"
          />
        </button>
        <span class="h-px min-w-4 flex-1 bg-border" aria-hidden="true"></span>
      </div>
      {#if geometryMounted}
        <div
          class={[
            'grid transition-[grid-template-rows] duration-[320ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
            prefersReducedMotion.current && 'transition-none',
          ]}
          style:grid-template-rows={geometryOpen ? '1fr' : '0fr'}
        >
          <div class="min-h-0 overflow-hidden">
            <div class="mt-3">
              <GeometryPanel {model} {trace} method="lp" showTitle={false} />
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if stepsAvailable}
    <div class="mt-6">
      <div class="flex items-center gap-3">
        <span class="h-px min-w-4 flex-1 bg-border" aria-hidden="true"></span>
        <button
          type="button"
          class="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-soft transition-colors duration-200 hover:bg-bg-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          aria-expanded={stepsOpen}
          disabled={stepsPreparing}
          onclick={onStepsToggle}
        >
          <span>
            {stepsPreparing ? t('loading') : stepsOpen ? t('solveDetailsHide') : t('solveDetails')}
          </span>
          <ChevronDown
            class={[
              'size-3.5 shrink-0 transition-transform duration-[320ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
              stepsOpen && 'rotate-180',
              (stepsPreparing || prefersReducedMotion.current) && 'transition-none',
            ]}
            aria-hidden="true"
          />
        </button>
        <span class="h-px min-w-4 flex-1 bg-border" aria-hidden="true"></span>
      </div>
      {#if stepsMounted}
        <div
          class={[
            'grid transition-[grid-template-rows] duration-[320ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
            prefersReducedMotion.current && 'transition-none',
          ]}
          style:grid-template-rows={stepsOpen ? '1fr' : '0fr'}
        >
          <div class="min-h-0 overflow-hidden">
            <div class="mt-3">
              {#if solveMethod === 'ga' && model}
                <GaStepsPanel {model} {trace} lpOptimum={null} {gapVsLp} />
              {:else if solveMethod === 'lp'}
                <SimplexStepsPanel {trace} />
              {:else}
                <p class="text-sm text-text-muted">{t('solveDetailsEmpty')}</p>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <LibraryVerifyPanel report={verifyReport} />

  {#if children}
    <div class="mt-6 border-t border-border pt-4">
      {@render children()}
    </div>
  {/if}
</Card>
