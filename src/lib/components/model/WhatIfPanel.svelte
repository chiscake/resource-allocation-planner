<script lang="ts">
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import LpModelMatrix from './LpModelMatrix.svelte';
  import WhatIfTableBody from './WhatIfTableBody.svelte';
  import WhatIfInteractivePanel from './WhatIfInteractivePanel.svelte';
  import type { WhatIfRow } from './solve-session.svelte';
  import type { Model, Mutation, SolveMethod, SolveResult, WhatIfRowData } from '$lib/domain';
  import type { WhatIfBadge } from '$lib/domain/whatif-generation';
  import type { SolveTransport, SolveTransportOpts } from './solve-session.svelte';
  import type { InteractiveScenarioPayload } from './interactive-preview.svelte';

  type WhatIfTab = 'pack' | 'interactive' | 'both';

  let {
    rows,
    generationIndex = 0,
    generationCount = 1,
    onGenerationChange,
    /** Index of the «Текущий» pager slot; used for «К текущему». */
    currentGenerationIndex = null,
    activeHint,
    archiveHint,
    badge = null,
    emptyMessage = null,
    baseModel = null,
    showRestore = false,
    onRestore,
    onCreateTaskFromScenario,
    onCompareScenario,
    interactiveBaseModel = null,
    interactiveBaseResult = null,
    interactiveMethod = 'lp' as SolveMethod,
    interactiveTransport = null,
    interactiveTransportOpts = undefined,
    interactiveExistingMutations = [],
    interactiveBusy = false,
    canCreateTaskFromInteractive = true,
    createTaskDisabledReason = null,
    onAddInteractiveToTable,
  }: {
    rows: WhatIfRow[];
    generationIndex?: number;
    generationCount?: number;
    onGenerationChange?: (index: number) => void;
    currentGenerationIndex?: number | null;
    activeHint?: string;
    archiveHint?: string;
    badge?: WhatIfBadge | null;
    /** When set, show instead of the table (empty current step). */
    emptyMessage?: string | null;
    /** Source LP table snapshot for this generation (readonly). */
    baseModel?: Model | null;
    showRestore?: boolean;
    onRestore?: () => void;
    onCreateTaskFromScenario?: (row: WhatIfRowData) => void;
    onCompareScenario?: (row: WhatIfRowData) => void;
    /** Base for interactive explorer (current root or active gen base). */
    interactiveBaseModel?: Model | null;
    interactiveBaseResult?: SolveResult | null;
    interactiveMethod?: SolveMethod;
    interactiveTransport?: SolveTransport | null;
    interactiveTransportOpts?: SolveTransportOpts;
    interactiveExistingMutations?: Array<Mutation | null | undefined>;
    interactiveBusy?: boolean;
    canCreateTaskFromInteractive?: boolean;
    createTaskDisabledReason?: string | null;
    onAddInteractiveToTable?: (payload: InteractiveScenarioPayload) => void | Promise<void>;
  } = $props();

  let tab = $state<WhatIfTab>('both');

  const showPager = $derived(generationCount > 1);
  const showGoToCurrent = $derived(
    showPager &&
      onGenerationChange != null &&
      currentGenerationIndex != null &&
      currentGenerationIndex >= 0 &&
      generationIndex !== currentGenerationIndex,
  );
  const showInteractiveChrome = $derived(
    interactiveBaseModel != null && interactiveTransport != null,
  );
  const showPanel = $derived(
    rows.length > 0 || Boolean(emptyMessage) || showPager || showInteractiveChrome,
  );
  const interactiveEnabled = $derived(badge !== 'past');
  const showPackHint = $derived(tab === 'pack' || tab === 'both');
  const showInteractivePane = $derived(
    (tab === 'interactive' || tab === 'both') && showInteractiveChrome,
  );
  const showPackPane = $derived(tab === 'pack' || tab === 'both');
  const hint = $derived(
    emptyMessage
      ? null
      : showPager
        ? badge === 'current'
          ? (activeHint ?? t('generationActiveHint'))
          : (archiveHint ?? '')
        : badge === 'current'
          ? (activeHint ?? t('generationActiveHint'))
          : null,
  );
  const badgeLabel = $derived(
    badge === 'current' ? t('whatIfBadgeCurrent') : badge === 'past' ? t('whatIfBadgePast') : null,
  );
  /** Generation snapshot, else interactive/root base (e.g. empty current). */
  const displayBaseModel = $derived(baseModel ?? interactiveBaseModel);

  /** Remount body when the row set / generation changes → clears multi-expand. */
  const rowsFingerprint = $derived(
    `${generationIndex}|` +
      rows
        .map((r, i) =>
          r.mutation
            ? `${r.mutation.kind}:${r.mutation.target}:${r.mutation.delta}`
            : `i:${i}:${r.title}`,
        )
        .join(';'),
  );

  function tabClass(id: WhatIfTab): string {
    return tab === id ? 'bg-brand-soft! text-brand!' : 'text-text-muted! hover:bg-surface!';
  }
</script>

{#if showPanel}
  <Card>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-medium">{t('whatIf')}</h2>
        {#if badgeLabel}
          <span
            class={[
              'rounded-md px-2 py-0.5 text-xs font-medium',
              badge === 'current' ? 'bg-brand-faint text-brand' : 'bg-bg-soft text-text-muted',
            ]}
          >
            {badgeLabel}
          </span>
        {/if}
      </div>
      {#if showPager && onGenerationChange}
        <div class="flex flex-wrap items-center gap-2">
          {#if showGoToCurrent && currentGenerationIndex != null}
            <Button
              variant="secondary"
              class="px-2.5! py-1! text-xs"
              onclick={() => onGenerationChange(currentGenerationIndex)}
            >
              {t('whatIfGoToCurrent')}
            </Button>
          {/if}
          <div class="flex items-center gap-3">
            <Button
              variant="ghost"
              class="px-2! py-1!"
              disabled={generationIndex <= 0}
              onclick={() => onGenerationChange(generationIndex - 1)}
            >
              ←
            </Button>
            <span class="font-mono text-sm">{generationIndex + 1}/{generationCount}</span>
            <Button
              variant="ghost"
              class="px-2! py-1!"
              disabled={generationIndex >= generationCount - 1}
              onclick={() => onGenerationChange(generationIndex + 1)}
            >
              →
            </Button>
          </div>
        </div>
      {/if}
    </div>

    {#if displayBaseModel}
      <div class="mb-6">
        <div class="mb-2 flex flex-wrap items-center gap-3">
          <p class="text-sm font-medium text-text-muted">
            {t('whatIfBaseMatrix')}
          </p>
          {#if showRestore && onRestore}
            <Button variant="secondary" class="px-3! py-1.5! text-sm" onclick={onRestore}>
              {t('whatIfRestoreBase')}
            </Button>
          {/if}
        </div>
        {#key rowsFingerprint}
          <LpModelMatrix model={displayBaseModel} readonly />
        {/key}
      </div>
    {/if}

    {#if showInteractiveChrome}
      <div class="mb-4 flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          class="px-2.5! py-1! text-xs {tabClass('both')}"
          onclick={() => (tab = 'both')}
        >
          {t('tabWhatIfBoth')}
        </Button>
        <Button
          variant="ghost"
          class="px-2.5! py-1! text-xs {tabClass('interactive')}"
          disabled={!interactiveEnabled && tab !== 'interactive'}
          title={!interactiveEnabled ? t('whatIfPastInteractiveHint') : undefined}
          onclick={() => (tab = 'interactive')}
        >
          {t('tabSensitivity')}
        </Button>
        <Button
          variant="ghost"
          class="px-2.5! py-1! text-xs {tabClass('pack')}"
          onclick={() => (tab = 'pack')}
        >
          {t('tabWhatIfPack')}
        </Button>
      </div>
    {/if}

    {#if hint && showPackHint}
      <p class="mb-3 text-xs text-text-soft">{hint}</p>
    {/if}

    {#if showInteractivePane && interactiveBaseModel && interactiveTransport}
      {#if tab === 'both'}
        <h3 class="mb-3 text-sm font-medium text-text-muted">
          {t('tabSensitivity')}
        </h3>
      {/if}
      <WhatIfInteractivePanel
        baseModel={interactiveBaseModel}
        baseResult={interactiveBaseResult}
        method={interactiveMethod}
        transport={interactiveTransport}
        transportOpts={interactiveTransportOpts}
        existingMutations={interactiveExistingMutations}
        {interactiveEnabled}
        canCreateTask={canCreateTaskFromInteractive}
        {createTaskDisabledReason}
        busyExternal={interactiveBusy}
        onAddToTable={onAddInteractiveToTable}
        onCreateTask={onCreateTaskFromScenario}
      />
    {/if}

    {#if showPackPane}
      {#if showInteractivePane}
        <div class="my-5 border-t border-border"></div>
        <h3 class="mb-3 text-sm font-medium text-text-muted">
          {t('tabWhatIfPack')}
        </h3>
      {/if}
      {#if emptyMessage}
        <p class="text-sm text-text-muted">{emptyMessage}</p>
      {:else if rows.length}
        {#key rowsFingerprint}
          <WhatIfTableBody {rows} {onCreateTaskFromScenario} {onCompareScenario} />
        {/key}
      {/if}
    {/if}
  </Card>
{/if}
