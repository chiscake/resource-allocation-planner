<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Model, WhatIfRowData } from "$lib/domain";
  import { regenerateTrace } from "$lib/solver";
  import { t } from "$lib/i18n";
  import Card from "$lib/components/ui/Card.svelte";
  import LpModelMatrix from "./LpModelMatrix.svelte";
  import PlanSolveControls from "./PlanSolveControls.svelte";
  import RoundPlanToggle from "./RoundPlanToggle.svelte";
  import SolveResultPanel from "./SolveResultPanel.svelte";
  import WhatIfPanel from "./WhatIfPanel.svelte";
  import MethodComparisonPanel from "./MethodComparisonPanel.svelte";
  import InlineAlert from "$lib/components/ui/InlineAlert.svelte";
  import type { SolveSession, WhatIfRow } from "./solve-session.svelte";
  import { DEFAULT_GA_HYPERPARAMS } from "$lib/solver/methods/ga";
  import { resolveGaFromRunConfig } from "$lib/solver/methods/ga/presets";
  import { DEFAULT_DLN_HYPERPARAMS } from "$lib/solver/methods/dln";
  import { resolveDlnFromRunConfig } from "$lib/solver/methods/dln/presets";

  let {
    session,
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
    onWhatIfGenerationChange,
    whatIfActiveHint,
    whatIfArchiveHint,
    onCreateTaskFromScenario,
    onModelChange,
    onWhatIfChange,
    onSolve,
    onSolveCloud,
  }: {
    session: SolveSession;
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
    onWhatIfGenerationChange?: (index: number) => void;
    whatIfActiveHint?: string;
    whatIfArchiveHint?: string;
    onCreateTaskFromScenario?: (row: WhatIfRowData) => void;
    onModelChange: (next: Model) => void;
    onWhatIfChange: (
      field: Parameters<SolveSession["updateWhatIf"]>[0],
      raw: string,
    ) => void;
    onSolve: () => void;
    onSolveCloud?: () => void;
  } = $props();

  const model = $derived(session.model);
  const rows = $derived(whatIfRows ?? session.whatIfItems);

  function onRequestSteps() {
    if (session.lastTrace || !session.model) return;
    const method = session.solveMethod;
    const provenance = session.lastResponse?.solver_meta.provenance;
    const { trace } = regenerateTrace(
      session.model,
      provenance,
      method,
      session.lastResponse?.solver_meta.engine ?? "native",
    );
    session.lastTrace = trace;
  }

  const gaHyper = $derived(
    resolveGaFromRunConfig(
      session.gaPreset === "custom"
        ? { preset: "custom", ...session.gaConfig }
        : { preset: session.gaPreset, seed: session.gaConfig.seed },
      DEFAULT_GA_HYPERPARAMS,
    ).hyper,
  );

  const dlnHyper = $derived(
    resolveDlnFromRunConfig(
      session.dlnPreset === "custom"
        ? { preset: "custom", ...session.dlnConfig }
        : { preset: session.dlnPreset },
      DEFAULT_DLN_HYPERPARAMS,
    ).hyper,
  );
</script>

{#if model}
  <section class={["flex flex-col", compact ? "gap-5" : "gap-6"]}>
    {#if session.error}
      <InlineAlert>{session.error}</InlineAlert>
    {/if}

    <Card>
      <p class="mb-2 text-sm font-medium">{t("modelMatrix")}</p>
      <LpModelMatrix {model} onchange={onModelChange} />
      <div class="mt-4">
        <PlanSolveControls
          {model}
          bind:activeTab={
            () => session.activeTab, (v) => (session.activeTab = v)
          }
          bind:includeSensitivity={
            () => session.includeSensitivity,
            (v) => (session.includeSensitivity = v)
          }
          bind:gaPreset={() => session.gaPreset, (v) => (session.gaPreset = v)}
          bind:gaConfig={() => session.gaConfig, (v) => (session.gaConfig = v)}
          bind:dlnPreset={
            () => session.dlnPreset, (v) => (session.dlnPreset = v)
          }
          bind:dlnConfig={
            () => session.dlnConfig, (v) => (session.dlnConfig = v)
          }
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
      <RoundPlanToggle
        bind:roundPlan={
          () => session.roundPlan, (v) => (session.roundPlan = v)
        }
      />

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
        >
          {#if resultExtras}
            {@render resultExtras()}
          {/if}
        </SolveResultPanel>
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
      onGenerationChange={onWhatIfGenerationChange}
      activeHint={whatIfActiveHint}
      archiveHint={whatIfArchiveHint}
      {onCreateTaskFromScenario}
    />
  </section>
{/if}
