<script lang="ts">
  import { onMount } from 'svelte';
  import { guestWhatIfStateFromSnapshot, loadGuest, saveGuest } from '$lib/db/guest';
  import {
    buildPagerSlots,
    buildWhatIfRowData,
    clearGuestActiveGeneration,
    appendGuestGeneration,
    appendGuestSensitivityItem,
    createBlankModel,
    defaultPagerIndex,
    guestGenerationItems,
    hasMutation,
    resolveActiveAfterModelEdit,
    restoreGuestGeneration,
    type GuestWhatIfState,
    type Model,
    type Mutation,
    type SolveResult,
    type SolverMeta,
  } from '$lib/domain';
  import { solveLocal, runMutationsLocal } from '$lib/solver';
  import { t } from '$lib/i18n';
  import SolveWorkspace from '$lib/components/model/SolveWorkspace.svelte';
  import {
    createSolveSession,
    type SolveTransport,
    type WhatIfRow,
  } from '$lib/components/model/solve-session.svelte';
  import type { InteractiveScenarioPayload } from '$lib/components/model/interactive-preview.svelte';
  import { resolveSolveMode } from '$lib/solver/mode';

  let {
    showLoginCta = true,
    compact = false,
  }: {
    showLoginCta?: boolean;
    compact?: boolean;
  } = $props();

  let title = $state('');
  let whatIfState = $state<GuestWhatIfState>({
    generations: [],
    activeGeneration: null,
  });
  let genIndex = $state(0);
  let solverMeta = $state<SolverMeta | null>(null);
  const session = createSolveSession();

  const localTransport: SolveTransport = {
    solve: async (model, method, opts) =>
      solveLocal(model, 'local', 0, method, opts?.engine, opts?.options),
    runMutations: async (model, mutations, method, opts) =>
      runMutationsLocal(model, mutations, 'local', method, opts?.engine, opts?.options),
  };

  const generations = $derived(whatIfState.generations.map((g) => g.generation));
  const pagerSlots = $derived(buildPagerSlots(generations, whatIfState.activeGeneration));
  const activeSlot = $derived(pagerSlots[genIndex] ?? null);
  const currentPagerIndex = $derived(pagerSlots.findIndex((s) => s.badge === 'current'));
  const activeGen = $derived(activeSlot?.kind === 'generation' ? activeSlot.generation : null);
  const packBase = $derived(
    activeGen != null
      ? (whatIfState.generations.find((g) => g.generation === activeGen)?.base ?? null)
      : null,
  );
  /** Sensitivity pack always continuous — ignore session.roundPlan (base card only). */
  const whatIfRows = $derived.by((): WhatIfRow[] => {
    if (activeGen == null || !packBase) return [];
    const items = guestGenerationItems(whatIfState, activeGen);
    return items.map((item) =>
      buildWhatIfRowData({
        base: packBase.model,
        baseResult: packBase.result,
        mutation: item.mutation,
        mutatedModel: item.model,
        result: item.result,
        valuesFromMutated: true,
      }),
    );
  });
  const whatIfEmptyMessage = $derived(
    activeSlot?.kind === 'empty_current' ? t('whatIfNotRun') : null,
  );
  const whatIfBadge = $derived(activeSlot?.badge ?? null);
  const whatIfShowRestore = $derived(
    Boolean(activeSlot?.kind === 'generation' && activeSlot.canRestore),
  );
  const showWhatIfChrome = $derived(
    Boolean(session.result) && (generations.length > 0 || whatIfState.activeGeneration === null),
  );
  const interactiveBaseModel = $derived(
    showWhatIfChrome ? (packBase?.model ?? session.model ?? null) : null,
  );
  const interactiveBaseResult = $derived(
    showWhatIfChrome ? (packBase?.result ?? session.result ?? null) : null,
  );
  const interactiveExistingMutations = $derived(whatIfRows.map((r) => r.mutation));
  const interactiveTransportOpts = $derived({
    engine: resolveSolveMode(session.solveMethod, false).engine,
    cloud: false,
    options: session.buildRunOptions(session.solveMethod),
  });

  function persist() {
    if (!session.model) return;
    saveGuest({
      title: title || t('newTask'),
      model: session.model,
      result: session.result ?? undefined,
      solver_meta: solverMeta ?? undefined,
      what_if_state: whatIfState,
      updated_at: new Date().toISOString(),
    });
  }

  function syncPagerToActive() {
    genIndex = defaultPagerIndex(
      buildPagerSlots(
        whatIfState.generations.map((g) => g.generation),
        whatIfState.activeGeneration,
      ),
    );
  }

  function initFromGuest(guest: ReturnType<typeof loadGuest>) {
    if (guest?.model) {
      title = guest.title || t('newTask');
      whatIfState = guestWhatIfStateFromSnapshot(guest);
      solverMeta = (guest.solver_meta as SolverMeta | undefined) ?? null;
      const hasSensitivityPack =
        whatIfState.generations.some((g) => g.items.length > 0) ||
        whatIfState.activeGeneration != null;
      session.hydrate({
        model: guest.model as Model,
        result: (guest.result as SolveResult | undefined) ?? null,
        whatIfItems: [],
        includeSensitivity: hasSensitivityPack,
      });
      syncPagerToActive();
      return;
    }
    title = t('newTask');
    whatIfState = { generations: [], activeGeneration: null };
    solverMeta = null;
    session.hydrate({
      model: createBlankModel(),
      result: null,
      whatIfItems: [],
    });
  }

  onMount(() => {
    session.loadRoundPref();
    initFromGuest(loadGuest());
  });

  function onModelChange(next: Model) {
    session.replaceModel(next);
    const baseModel =
      whatIfState.activeGeneration != null
        ? whatIfState.generations.find((g) => g.generation === whatIfState.activeGeneration)?.base
            .model
        : null;
    const nextActive = resolveActiveAfterModelEdit(whatIfState.activeGeneration, baseModel, next);
    if (nextActive !== whatIfState.activeGeneration) {
      whatIfState = { ...whatIfState, activeGeneration: nextActive };
      syncPagerToActive();
    }
    persist();
  }

  function onWhatIfChange(field: Parameters<typeof session.updateWhatIf>[0], raw: string) {
    session.updateWhatIf(field, raw);
    persist();
  }

  function restoreBase() {
    if (activeSlot?.kind !== 'generation' || !activeSlot.canRestore) return;
    const restored = restoreGuestGeneration(whatIfState, activeSlot.generation);
    if (!restored) return;
    whatIfState = restored.state;
    session.hydrate({
      model: restored.base.model,
      result: restored.base.result,
      whatIfItems: [],
    });
    solverMeta = restored.base.solver_meta;
    syncPagerToActive();
    persist();
  }

  async function doSolve() {
    const cycle = await session.runSolveCycle(localTransport);
    if (!cycle) return;
    solverMeta = cycle.response.solver_meta ?? null;

    if (session.includeSensitivity && cycle.mutationsResponse?.status === 'done') {
      const items = cycle.mutationsResponse.items.map((item) => ({
        title: item.mutation.label ?? item.mutation.kind,
        mutation: item.mutation as Mutation,
        model: item.model,
        result: item.response.result ?? null,
        solver_meta: item.response.solver_meta ?? null,
      }));
      whatIfState = appendGuestGeneration(
        whatIfState,
        {
          model: cycle.model,
          result: cycle.result,
          solver_meta: cycle.response.solver_meta ?? null,
        },
        items,
      );
      syncPagerToActive();
    } else {
      whatIfState = clearGuestActiveGeneration(whatIfState);
      syncPagerToActive();
    }
    persist();
  }

  function addInteractiveToTable(payload: InteractiveScenarioPayload) {
    if (whatIfBadge === 'past' || !session.model) return;
    const { row, result, solver_meta } = payload;
    if (hasMutation(interactiveExistingMutations, row.mutation)) return;
    const base = {
      model: interactiveBaseModel ?? session.model,
      result: interactiveBaseResult ?? session.result,
      solver_meta: solverMeta,
    };
    whatIfState = appendGuestSensitivityItem(whatIfState, base, {
      title: row.title,
      mutation: row.mutation,
      model: row.mutatedModel,
      result,
      solver_meta,
    });
    syncPagerToActive();
    persist();
  }
</script>

{#if !session.model}
  <p class="text-text-muted">…</p>
{:else}
  <SolveWorkspace
    {session}
    {showLoginCta}
    {compact}
    whatIfRows={showWhatIfChrome ? whatIfRows : []}
    whatIfGenerationIndex={genIndex}
    whatIfGenerationCount={showWhatIfChrome ? pagerSlots.length : 0}
    whatIfCurrentGenerationIndex={showWhatIfChrome ? currentPagerIndex : null}
    onWhatIfGenerationChange={(i) => (genIndex = i)}
    whatIfBadge={showWhatIfChrome ? whatIfBadge : null}
    whatIfEmptyMessage={showWhatIfChrome ? whatIfEmptyMessage : null}
    whatIfBaseModel={showWhatIfChrome ? (packBase?.model ?? null) : null}
    whatIfShowRestore={showWhatIfChrome && whatIfShowRestore}
    onWhatIfRestore={restoreBase}
    {interactiveBaseModel}
    {interactiveBaseResult}
    interactiveMethod={session.solveMethod}
    interactiveTransport={localTransport}
    {interactiveTransportOpts}
    {interactiveExistingMutations}
    interactiveBusy={session.busy}
    canCreateTaskFromInteractive={false}
    createTaskDisabledReason={t('whatIfCreateNeedsLogin')}
    onAddInteractiveToTable={addInteractiveToTable}
    {onModelChange}
    {onWhatIfChange}
    onSolve={doSolve}
  />
{/if}
