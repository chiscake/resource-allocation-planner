<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Model, Mutation, SolveMethod, SolveResult, WhatIfRowData } from '$lib/domain';
  import { regenerateTrace } from '$lib/solver';
  import { t } from '$lib/i18n';
  import Card from '$lib/components/ui/Card.svelte';
  import LpModelMatrix from './LpModelMatrix.svelte';
  import PlanSolveControls from './PlanSolveControls.svelte';
  import RoundPlanToggle from './RoundPlanToggle.svelte';
  import SolveResultPanel from './SolveResultPanel.svelte';
  import WhatIfPanel from './WhatIfPanel.svelte';
  import MethodComparisonPanel from './MethodComparisonPanel.svelte';
  import ModelCsvActions from './ModelCsvActions.svelte';
  import InlineAlert from '$lib/components/ui/InlineAlert.svelte';
  import type {
    SolveSession,
    SolveTransport,
    SolveTransportOpts,
    WhatIfRow,
  } from './solve-session.svelte';
  import type { InteractiveScenarioPayload } from './interactive-preview.svelte';
  import { DEFAULT_GA_HYPERPARAMS } from '$lib/solver/methods/ga';
  import { resolveGaFromRunConfig } from '$lib/solver/methods/ga/presets';
  import { DEFAULT_DLN_HYPERPARAMS } from '$lib/solver/methods/dln';
  import { resolveDlnFromRunConfig } from '$lib/solver/methods/dln/presets';

  let {
    session,
    title = '',
    showLoginCta = false,
    showCloudSplit = false,
    compact = false,
    solverLibrary = null,
    matrixFooter,
    planExtras,
    resultExtras,
    whatIfRows,
    whatIfGenerationIndex = 0,
    whatIfGenerationCount = 1,
    whatIfCurrentGenerationIndex = null,
    onWhatIfGenerationChange,
    whatIfActiveHint,
    whatIfArchiveHint,
    whatIfBadge = null,
    whatIfEmptyMessage = null,
    whatIfBaseModel = null,
    whatIfShowRestore = false,
    onWhatIfRestore,
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
    onModelChange,
    onWhatIfChange,
    onSolve,
    onSolveCloud,
  }: {
    session: SolveSession;
    /** Task title — used for downloaded file names and export headers. */
    title?: string;
    showLoginCta?: boolean;
    showCloudSplit?: boolean;
    compact?: boolean;
    solverLibrary?: string | null;
    matrixFooter?: Snippet;
    planExtras?: Snippet;
    resultExtras?: Snippet;
    whatIfRows?: WhatIfRow[];
    whatIfGenerationIndex?: number;
    whatIfGenerationCount?: number;
    /** Pager index of the «Текущий» slot (for jump button). */
    whatIfCurrentGenerationIndex?: number | null;
    onWhatIfGenerationChange?: (index: number) => void;
    whatIfActiveHint?: string;
    whatIfArchiveHint?: string;
    whatIfBadge?: 'current' | 'past' | null;
    whatIfEmptyMessage?: string | null;
    whatIfBaseModel?: Model | null;
    whatIfShowRestore?: boolean;
    onWhatIfRestore?: () => void;
    onCreateTaskFromScenario?: (row: WhatIfRowData) => void;
    onCompareScenario?: (row: WhatIfRowData) => void;
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
    onModelChange: (next: Model) => void;
    onWhatIfChange: (field: Parameters<SolveSession['updateWhatIf']>[0], raw: string) => void;
    onSolve: () => void;
    onSolveCloud?: () => void;
  } = $props();

  const model = $derived(session.model);
  const rows = $derived(whatIfRows ?? session.whatIfItems);

  function onRequestSteps() {
    if (session.lastTrace || !session.model) return;
    const method = session.solveMethod;
    const meta = session.lastResponse?.solver_meta;
    const { trace } = regenerateTrace(
      session.model,
      meta?.provenance,
      method,
      meta?.engine ?? 'native',
      session.buildRunOptions(method),
    );
    session.lastTrace = trace;
  }

  const gaHyper = $derived(
    resolveGaFromRunConfig(
      session.gaPreset === 'custom'
        ? { preset: 'custom', ...session.gaConfig }
        : { preset: session.gaPreset, seed: session.gaConfig.seed },
      DEFAULT_GA_HYPERPARAMS,
    ).hyper,
  );

  const dlnHyper = $derived(
    resolveDlnFromRunConfig(
      session.dlnPreset === 'custom'
        ? { preset: 'custom', ...session.dlnConfig }
        : { preset: session.dlnPreset },
      DEFAULT_DLN_HYPERPARAMS,
    ).hyper,
  );
</script>

{#if model}
  <section class={['flex flex-col', compact ? 'gap-5' : 'gap-6']}>
    {#if session.error}
      <InlineAlert>{session.error}</InlineAlert>
    {/if}

    <Card>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm font-medium">{t('modelMatrix')}</p>
        <ModelCsvActions {model} {title} disabled={session.busy} onimport={onModelChange} />
      </div>
      <LpModelMatrix {model} onchange={onModelChange} />
      <div class="mt-4">
        <PlanSolveControls
          {model}
          bind:activeTab={() => session.activeTab, (v) => (session.activeTab = v)}
          bind:includeSensitivity={
            () => session.includeSensitivity, (v) => (session.includeSensitivity = v)
          }
          bind:gaPreset={() => session.gaPreset, (v) => (session.gaPreset = v)}
          bind:gaConfig={() => session.gaConfig, (v) => (session.gaConfig = v)}
          bind:dlnPreset={() => session.dlnPreset, (v) => (session.dlnPreset = v)}
          bind:dlnConfig={() => session.dlnConfig, (v) => (session.dlnConfig = v)}
          busy={session.busy}
          {showLoginCta}
          {showCloudSplit}
          {onWhatIfChange}
          {onSolve}
          {onSolveCloud}
        />
      </div>
      {#if matrixFooter}
        {@render matrixFooter()}
      {/if}
      {#if planExtras}
        <div class="mt-6 border-t border-border pt-4">
          {@render planExtras()}
        </div>
      {/if}
    </Card>

    {#if session.result && session.displayResult}
      <RoundPlanToggle bind:roundPlan={() => session.roundPlan, (v) => (session.roundPlan = v)} />

      {#key session.solveEpoch}
        <SolveResultPanel
          result={session.displayResult}
          {model}
          roundPlan={session.roundPlan}
          productOrder={model.products}
          resourceOrder={model.resources}
          {solverLibrary}
          trace={session.lastTrace}
          stepsAvailable={session.stepsAvailable}
          verifyReport={session.verifyReport}
          solveMethod={session.solveMethod}
          gapVsLp={session.lastResponse?.solver_meta.gap_vs_lp ?? null}
          {onRequestSteps}
          exportTitle={title || t('newTask')}
          whatIfRows={rows}
          {resultExtras}
        />
      {/key}

      {#if !compact}
        <MethodComparisonPanel
          {model}
          {gaHyper}
          gaPreset={session.gaPreset}
          {dlnHyper}
          dlnPreset={session.dlnPreset}
        />
      {/if}
    {/if}

    <WhatIfPanel
      {rows}
      generationIndex={whatIfGenerationIndex}
      generationCount={whatIfGenerationCount}
      currentGenerationIndex={whatIfCurrentGenerationIndex}
      onGenerationChange={onWhatIfGenerationChange}
      activeHint={whatIfActiveHint}
      archiveHint={whatIfArchiveHint}
      badge={whatIfBadge}
      emptyMessage={whatIfEmptyMessage}
      baseModel={whatIfBaseModel}
      showRestore={whatIfShowRestore}
      onRestore={onWhatIfRestore}
      {onCreateTaskFromScenario}
      {onCompareScenario}
      {interactiveBaseModel}
      {interactiveBaseResult}
      {interactiveMethod}
      {interactiveTransport}
      {interactiveTransportOpts}
      {interactiveExistingMutations}
      {interactiveBusy}
      {canCreateTaskFromInteractive}
      {createTaskDisabledReason}
      {onAddInteractiveToTable}
    />
  </section>
{/if}
