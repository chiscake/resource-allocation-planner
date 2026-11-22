<script lang="ts">
  import { labeledName } from '$lib/display/units';
  import {
    INTERACTIVE_DELTA_PCT_MAX,
    INTERACTIVE_DELTA_PCT_MIN,
    INTERACTIVE_PREVIEW_DEBOUNCE_MS,
    clampDeltaPct,
    hasMutation,
    seedDeltaPct,
    targetsForKind,
    type Model,
    type Mutation,
    type MutationKind,
    type SolveMethod,
    type SolveResult,
    type WhatIfRowData,
  } from '$lib/domain';
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import LpModelMatrix from './LpModelMatrix.svelte';
  import { formatPlanNumber } from './format-plan-number';
  import {
    runInteractivePreview,
    shouldAutoPreview,
    type InteractiveScenarioPayload,
  } from './interactive-preview.svelte';
  import type { SolveTransport, SolveTransportOpts } from './solve-session.svelte';

  let {
    baseModel,
    baseResult = null,
    method,
    transport,
    transportOpts,
    existingMutations = [],
    interactiveEnabled = true,
    canCreateTask = true,
    createTaskDisabledReason = null,
    busyExternal = false,
    onAddToTable,
    onCreateTask,
  }: {
    baseModel: Model;
    baseResult?: SolveResult | null;
    method: SolveMethod;
    transport: SolveTransport;
    transportOpts?: SolveTransportOpts;
    existingMutations?: Array<Mutation | null | undefined>;
    /** False on past generation slot. */
    interactiveEnabled?: boolean;
    canCreateTask?: boolean;
    createTaskDisabledReason?: string | null;
    busyExternal?: boolean;
    onAddToTable?: (payload: InteractiveScenarioPayload) => void | Promise<void>;
    onCreateTask?: (row: WhatIfRowData) => void | Promise<void>;
  } = $props();

  let kind = $state<MutationKind>('resource_change');
  let target = $state('');
  let deltaPct = $state(10);
  let preview = $state<InteractiveScenarioPayload | null>(null);
  /** True while draft params differ from the last successful preview (keep card mounted). */
  let previewStale = $state(false);
  let previewError = $state('');
  let previewBusy = $state(false);
  let expanded = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let runId = 0;

  const kindOptions = $derived([
    { value: 'resource_change', label: t('whatIfKindResource') },
    { value: 'modernization', label: t('whatIfKindModernization') },
    { value: 'price_change', label: t('whatIfKindPrice') },
  ]);

  const targetOptions = $derived.by(() => {
    const names = targetsForKind(baseModel, kind);
    return names.map((name, i) => {
      const unit =
        kind === 'resource_change' ? baseModel.resource_units?.[i] : baseModel.product_units?.[i];
      return { value: name, label: labeledName(name, unit) };
    });
  });

  const autoPreview = $derived(shouldAutoPreview(method));
  const draftMutation = $derived.by((): Mutation | null => {
    if (!target) return null;
    return {
      kind,
      target,
      delta: clampDeltaPct(deltaPct) / 100,
    };
  });
  const isDuplicate = $derived(
    draftMutation != null && hasMutation(existingMutations, draftMutation),
  );
  const busy = $derived(previewBusy || busyExternal);
  const ZERO_EPS = 1e-9;

  function ensureTarget() {
    const opts = targetsForKind(baseModel, kind);
    if (!opts.includes(target)) {
      target = opts[0] ?? '';
    }
  }

  function onKindChange(next: string) {
    kind = next as MutationKind;
    deltaPct = seedDeltaPct(kind, baseModel.what_if_defaults);
    ensureTarget();
    scheduleOrClearPreview();
  }

  function setDeltaFromSlider(raw: string) {
    deltaPct = clampDeltaPct(Number(raw));
    scheduleOrClearPreview();
  }

  function setDeltaFromInput(raw: string) {
    const n = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(n)) return;
    deltaPct = clampDeltaPct(n);
    scheduleOrClearPreview();
  }

  /** Keep the previous result card mounted; only mark stale / re-schedule. */
  function scheduleOrClearPreview() {
    previewError = '';
    if (preview) previewStale = true;
    if (!interactiveEnabled || !autoPreview) return;
    schedulePreview();
  }

  function schedulePreview() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void doPreview();
    }, INTERACTIVE_PREVIEW_DEBOUNCE_MS);
  }

  async function doPreview() {
    if (!interactiveEnabled || !target || busyExternal) return;
    const id = ++runId;
    previewBusy = true;
    previewError = '';
    try {
      const run = await runInteractivePreview({
        baseModel,
        baseResult,
        kind,
        target,
        deltaPct,
        method,
        transport,
        transportOpts,
      });
      if (id !== runId) return;
      if (run.responseStatus !== 'done') {
        previewError = run.rejectedReason ?? run.responseStatus;
        // Keep last good card; mark stale so the user sees it is outdated.
        previewStale = true;
        return;
      }
      preview = {
        row: run.row,
        result: run.result,
        solver_meta: run.solver_meta,
      };
      previewStale = false;
    } catch (e) {
      if (id !== runId) return;
      previewError = e instanceof Error ? e.message : String(e);
      previewStale = true;
    } finally {
      if (id === runId) previewBusy = false;
    }
  }

  const previewRow = $derived(preview?.row ?? null);

  function fmtDelta(v: number): string {
    if (!Number.isFinite(v)) return '—';
    const s = formatPlanNumber(v);
    if (Math.abs(v) < ZERO_EPS) return formatPlanNumber(0);
    return v > 0 ? `+${s}` : s;
  }

  function shadowLabel(row: WhatIfRowData): string {
    if (row.shadowKind === 'resource') return t('whatIfShadowResource');
    if (row.shadowKind === 'modernization') return t('whatIfModernizationPrice');
    return t('whatIfShadowCol');
  }

  function planEntries(row: WhatIfRowData): [string, number][] {
    const keys = row.mutatedModel?.products?.length
      ? row.mutatedModel.products
      : Object.keys(row.plan ?? {});
    return keys.map((k) => [k, row.plan?.[k] ?? 0]);
  }

  function isZeroPlan(v: number): boolean {
    return !Number.isFinite(v) || Math.abs(v) < ZERO_EPS;
  }

  // Plain lets — must not be $state or assigning them re-runs the effect and
  // the cleanup cancels the just-scheduled / in-flight mount preview.
  let lastBaseKey = '';
  let didMountPreview = false;

  // Seed + target when the base model shape changes; run first preview on mount.
  $effect(() => {
    const key = `${baseModel.resources.join('\0')}\n${baseModel.products.join('\0')}`;
    ensureTarget();
    if (key !== lastBaseKey) {
      lastBaseKey = key;
      deltaPct = seedDeltaPct(kind, baseModel.what_if_defaults);
      didMountPreview = false;
    }
    if (!interactiveEnabled || !target) return;
    if (!didMountPreview) {
      didMountPreview = true;
      if (shouldAutoPreview(method)) {
        void doPreview();
      }
    }
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  });
</script>

{#if !interactiveEnabled}
  <p class="text-sm text-text-muted">{t('whatIfPastInteractiveHint')}</p>
{:else}
  <div class="flex flex-col gap-4">
    <div class="grid gap-3 sm:grid-cols-3">
      <label class="flex flex-col gap-1.5 text-sm">
        <span class="text-text-muted">{t('whatIfInteractiveKind')}</span>
        <Select
          value={kind}
          options={kindOptions}
          disabled={busy}
          onchange={(e) => onKindChange((e.currentTarget as HTMLSelectElement).value)}
        />
      </label>
      <label class="flex flex-col gap-1.5 text-sm">
        <span class="text-text-muted">{t('whatIfInteractiveTarget')}</span>
        <Select
          bind:value={target}
          options={targetOptions}
          disabled={busy || targetOptions.length === 0}
          onchange={() => scheduleOrClearPreview()}
        />
      </label>
      <div class="flex flex-col gap-1.5 text-sm">
        <span class="text-text-muted">{t('whatIfInteractiveDelta')}</span>
        <div class="flex items-center gap-2">
          <input
            type="range"
            class="min-w-0 flex-1 accent-brand"
            min={INTERACTIVE_DELTA_PCT_MIN}
            max={INTERACTIVE_DELTA_PCT_MAX}
            step="1"
            value={deltaPct}
            disabled={busy}
            oninput={(e) => setDeltaFromSlider((e.currentTarget as HTMLInputElement).value)}
          />
          <input
            type="number"
            class="w-16 rounded-[8px] border border-border bg-bg px-2 py-1.5 font-mono text-sm tabular-nums focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus"
            min={INTERACTIVE_DELTA_PCT_MIN}
            max={INTERACTIVE_DELTA_PCT_MAX}
            step="1"
            value={deltaPct}
            disabled={busy}
            onchange={(e) => setDeltaFromInput((e.currentTarget as HTMLInputElement).value)}
          />
        </div>
      </div>
    </div>

    {#if !autoPreview}
      <div>
        <Button variant="secondary" disabled={busy || !target} onclick={() => void doPreview()}>
          {t('whatIfRecalc')}
        </Button>
      </div>
    {/if}

    {#if previewError}
      <p class="text-sm text-danger-text">{previewError}</p>
    {/if}
    {#if target}
      <p class="text-xs text-text-soft">
        {isDuplicate ? t('whatIfInTable') : t('whatIfNotInTable')}
      </p>
    {/if}

    {#if previewRow}
      <div
        class={[
          'rounded-[8px] border border-border-soft bg-bg-soft/40 p-3 transition-opacity',
          previewStale || previewBusy ? 'opacity-60' : 'opacity-100',
        ]}
      >
        <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <div class="flex min-w-0 flex-wrap items-baseline gap-2">
            <p class="text-sm font-medium">{previewRow.title}</p>
            {#if previewBusy}
              <span class="text-xs text-text-soft">{t('whatIfInteractiveBusy')}</span>
            {/if}
          </div>
          <button
            type="button"
            class="cursor-pointer text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
            onclick={() => (expanded = !expanded)}
          >
            {expanded ? t('whatIfCollapsePreview') : t('whatIfExpandPreview')}
          </button>
        </div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <p class="text-xs text-text-muted">Z</p>
            <p class="font-mono tabular-nums">
              {Number.isFinite(previewRow.Z) ? formatPlanNumber(previewRow.Z) : '—'}
            </p>
          </div>
          <div>
            <p class="text-xs text-text-muted">{t('whatIfDeltaZ')}</p>
            <p class="font-mono tabular-nums text-text-muted">
              {fmtDelta(previewRow.deltaZ)}
            </p>
          </div>
          <div>
            <p class="text-xs text-text-muted">{shadowLabel(previewRow)}</p>
            <p class="font-mono tabular-nums">
              {#if previewRow.shadowMetric != null && Number.isFinite(previewRow.shadowMetric)}
                {formatPlanNumber(previewRow.shadowMetric)}
              {:else}
                <span class="text-text-faint">{t('whatIfShadowNone')}</span>
              {/if}
            </p>
          </div>
          <div class="col-span-2 sm:col-span-1">
            <p class="text-xs text-text-muted">{t('whatIfPlanAfter')}</p>
            <p class="truncate font-mono text-xs tabular-nums text-text-muted">
              {planEntries(previewRow)
                .filter(([, v]) => !isZeroPlan(v))
                .map(([n, v]) => `${n}: ${formatPlanNumber(v)}`)
                .join(' · ') || '—'}
            </p>
          </div>
        </div>

        {#if expanded}
          <div class="mt-4 border-t border-border-soft pt-3">
            <p class="mb-2 text-xs font-medium text-text-muted">
              {t('whatIfPlanAfter')}
            </p>
            <table class="mb-4 w-full max-w-md text-sm">
              <tbody>
                {#each planEntries(previewRow) as [name, value] (name)}
                  <tr
                    class="border-b border-border-soft last:border-0 {isZeroPlan(value)
                      ? 'text-text-faint'
                      : 'text-text'}"
                  >
                    <td class="py-1 pr-3">{name}</td>
                    <td class="py-1 text-right font-mono tabular-nums">
                      {formatPlanNumber(value)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>

            {#if previewRow.criticalResources?.length}
              <p class="mb-2 text-xs font-medium text-text-muted">
                {t('whatIfCriticalAfter')}
              </p>
              <ul class="mb-4 flex flex-wrap gap-2">
                {#each previewRow.criticalResources as name (name)}
                  <li class="text-sm text-text">{name}</li>
                {/each}
              </ul>
            {/if}

            {#if previewRow.mutatedModel}
              <p class="mb-2 text-xs font-medium text-text-muted">
                {t('mutationShowMatrix')}
              </p>
              <LpModelMatrix model={previewRow.mutatedModel} readonly />
            {/if}
          </div>
        {/if}
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="secondary"
          disabled={busy || previewStale || isDuplicate || !onAddToTable}
          title={isDuplicate ? t('whatIfDuplicateHint') : undefined}
          onclick={() => preview && onAddToTable?.(preview)}
        >
          {t('whatIfAddToTable')}
        </Button>
        <Button
          variant="primary"
          disabled={busy || previewStale || !previewRow || !canCreateTask || !onCreateTask}
          title={!canCreateTask
            ? (createTaskDisabledReason ?? t('whatIfCreateNeedsLogin'))
            : undefined}
          onclick={() => previewRow && onCreateTask?.(previewRow)}
        >
          {t('createTaskFromScenario')}
        </Button>
      </div>
      {#if !canCreateTask && createTaskDisabledReason}
        <p class="text-right text-xs text-text-soft">
          {createTaskDisabledReason}
        </p>
      {/if}
    {/if}
  </div>
{/if}
