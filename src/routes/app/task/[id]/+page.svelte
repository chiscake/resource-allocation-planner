<script lang="ts">
  import { page } from '$app/state';
  import { afterNavigate, goto } from '$app/navigation';
  import { env } from '$env/dynamic/public';
  import { isOrgsUiEnabled } from '$lib/features';
  import { toast } from 'svelte-sonner';
  import { supabase } from '$lib/db/supabase';
  import { writeAudit } from '$lib/db/audit';
  import { classifyShareIdentifier, isSelfShareIdentifier } from '$lib/db/share-grant';
  import { softDeleteSolveNode } from '$lib/db/soft-delete';
  import { solveModel, runMutations } from '$lib/api/solve';
  import { logSolverMismatches } from '$lib/db/solver-mismatch';
  import {
    cloneModel,
    createBlankModel,
    isSolveMethod,
    buildWhatIfRowData,
    KIND_SENSITIVITY,
    KIND_WHAT_IF_BASE,
    buildPagerSlots,
    collectGenerations,
    defaultPagerIndex,
    findBaseForGeneration,
    hasMutation,
    isSensitivityChild,
    isWhatIfBase,
    nextGenerationNumber,
    resolveActiveAfterModelEdit,
    sensitivityForGeneration,
    type Model,
    type SolveResult,
    type SolverMeta,
    type Mutation,
    type WhatIfDefaults,
    type RunMutationsResponse,
    formatCompareIds,
    taskForkProvenance,
    mutationForkProvenance,
  } from '$lib/domain';
  import { formatSavedAt } from '$lib/display/formatDateTime';
  import { t } from '$lib/i18n';
  import { isAppOffline, refreshConnectivityProbe } from '$lib/connectivity.svelte';
  import {
    DEFAULT_NETWORK_TIMEOUT_MS,
    isLikelyNetworkFailure,
    isOnline,
    networkFailureMessage,
    withTimeout,
  } from '$lib/online';
  import {
    getCachedTask,
    putCachedTask,
    type CachedSolveNode,
    type CachedTaskRecord,
  } from '$lib/db/offline-tasks';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import ChoiceModal from '$lib/components/ui/ChoiceModal.svelte';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import SolveWorkspace from '$lib/components/model/SolveWorkspace.svelte';
  import NodeComments from '$lib/components/NodeComments.svelte';
  import OrgAttachPanel from '$lib/components/OrgAttachPanel.svelte';
  import SharePanel, { type ShareGrantRow } from '$lib/components/SharePanel.svelte';
  import SharedTaskViewer from '$lib/components/SharedTaskViewer.svelte';
  import InlineAlert from '$lib/components/ui/InlineAlert.svelte';
  import {
    createSolveSession,
    preserveTraceForMeta,
    responseFromSaved,
    solveMethodToTab,
    type SolveTransport,
    type WhatIfRow,
  } from '$lib/components/model/solve-session.svelte';
  import type { InteractiveScenarioPayload } from '$lib/components/model/interactive-preview.svelte';
  import { resolveSolveMode } from '$lib/solver/mode';
  import type { VerifyReport } from '$lib/solver/verify';
  import {
    Star,
    GitFork,
    Trash2,
    Eraser,
    GitCompareArrows,
    EllipsisVertical,
  } from '@lucide/svelte';

  type NodeRow = {
    id: string;
    title: string;
    kind: string;
    model: Model;
    result: SolveResult | null;
    parent_id: string | null;
    what_if_generation: number | null;
    active_what_if_generation: number | null;
    deleted_at: string | null;
    mutation: Mutation | null;
    org_id: string | null;
    org_visibility: 'private' | 'org' | null;
    is_favorite: boolean;
    owner_id: string;
    solver_meta?: SolverMeta | null;
    updated_at?: string | null;
    created_at?: string | null;
  };

  type OrgOption = { id: string; name: string };
  type OrgJoin = { id: string; name: string } | { id: string; name: string }[] | null;

  function pickOrg(raw: OrgJoin): OrgOption | null {
    if (!raw) return null;
    const org = Array.isArray(raw) ? raw[0] : raw;
    return org ? { id: org.id, name: org.name } : null;
  }

  let node = $state<NodeRow | null>(null);
  let children = $state<NodeRow[]>([]);
  let activeWhatIfGeneration = $state<number | null>(null);
  let genIndex = $state(0);
  let error = $state('');
  /** Retry target after network/Supabase failure; keeps local session intact. */
  let pendingRetry = $state<'load' | 'save' | null>(null);
  let conflictOpen = $state(false);
  let pendingServerLoad = $state<{ root: NodeRow; kids: NodeRow[] } | null>(null);
  let pendingConflictCache = $state<CachedTaskRecord | null>(null);
  let orgId = $state('');
  let makePublic = $state(false);
  let shareUrl = $state('');
  let grantEmail = $state('');
  let shareMsg = $state('');
  let userOrgs = $state<OrgOption[]>([]);
  let hasActiveShare = $state(false);
  let shareGrants = $state<ShareGrantRow[]>([]);
  let viewerId = $state<string | null>(null);
  let actionsMenuOpen = $state(false);
  let trashConfirmOpen = $state(false);
  let clearConfirmOpen = $state(false);
  /**
   * Virtual empty «Текущий» — armed only by solve with sensitivity when this
   * step has no pack yet. Cleared by clear / model diverge / pack success.
   */
  let showEmptyCurrentSlot = $state(false);
  const session = createSolveSession();
  const showOrgs = isOrgsUiEnabled(env.PUBLIC_SHOW_ORGS);

  function closeActionsMenu() {
    actionsMenuOpen = false;
  }

  const id = $derived(page.params.id!);
  const isOwner = $derived(Boolean(node && viewerId && node.owner_id === viewerId));
  /** Soft-lock: any active share channel freezes content edits. */
  const isLocked = $derived(hasActiveShare);
  const isEditable = $derived(isOwner && !isLocked);
  const headerMeta = $derived(formatSavedAt(node?.updated_at) ?? undefined);
  const solverLibrary = $derived(
    typeof node?.solver_meta?.library === 'string' ? node.solver_meta.library : null,
  );
  const generations = $derived(collectGenerations(children));
  const includeEmptyCurrent = $derived(activeWhatIfGeneration == null && showEmptyCurrentSlot);
  const pagerSlots = $derived(
    buildPagerSlots(generations, activeWhatIfGeneration, { includeEmptyCurrent }),
  );
  const activeSlot = $derived(pagerSlots[genIndex] ?? null);
  const currentPagerIndex = $derived(pagerSlots.findIndex((s) => s.badge === 'current'));
  const activeGen = $derived(activeSlot?.kind === 'generation' ? activeSlot.generation : null);
  const whatIfChildren = $derived(children.filter(isSensitivityChild));
  const visibleChildren = $derived(
    activeGen != null ? sensitivityForGeneration(children, activeGen) : [],
  );
  const generationBase = $derived(
    activeGen != null ? findBaseForGeneration(children, activeGen) : null,
  );
  /** Sensitivity pack always continuous — ignore session.roundPlan (base card only). */
  const whatIfRows = $derived<WhatIfRow[]>(
    visibleChildren.flatMap((c) => {
      if (!c.mutation || !node) return [];
      const baseModel = generationBase?.model ?? node.model;
      const baseResult = generationBase?.result ?? node.result;
      const row = buildWhatIfRowData({
        base: baseModel,
        baseResult,
        mutation: c.mutation,
        mutatedModel: c.model,
        result: c.result,
        valuesFromMutated: true,
      });
      return [{ ...row, nodeId: c.id }];
    }),
  );
  const whatIfEmptyMessage = $derived(
    activeSlot?.kind === 'empty_current' ? t('whatIfNotRun') : null,
  );
  const whatIfBadge = $derived(activeSlot?.badge ?? null);
  const whatIfShowRestore = $derived(
    Boolean(activeSlot?.kind === 'generation' && activeSlot.canRestore),
  );
  const whatIfArchiveHint = $derived(
    activeSlot?.badge === 'past'
      ? t('generationPurge', {
          date: purgeDate(
            children.find((c) => c.what_if_generation === activeGen && c.deleted_at != null)
              ?.deleted_at ?? null,
          ),
        })
      : '',
  );
  /** Keep history visible after clear (no root result) when past gens exist. */
  const showWhatIfChrome = $derived(
    generations.length > 0 || (Boolean(session.result) && activeWhatIfGeneration === null),
  );
  /** Interactive explorer base: active gen snapshot, else current root. */
  const interactiveBaseModel = $derived(
    showWhatIfChrome ? (generationBase?.model ?? session.model ?? node?.model ?? null) : null,
  );
  const interactiveBaseResult = $derived(
    showWhatIfChrome ? (generationBase?.result ?? session.result ?? node?.result ?? null) : null,
  );
  const interactiveExistingMutations = $derived(visibleChildren.map((c) => c.mutation));
  const interactiveTransportOpts = $derived({
    engine: resolveSolveMode(session.solveMethod, session.lastWasCloud).engine,
    cloud: session.lastWasCloud,
    options: session.buildRunOptions(session.solveMethod),
  });
  const orgSelectOptions = $derived(userOrgs.map((o) => ({ value: o.id, label: o.name })));

  function purgeDate(deletedAt: string | null): string {
    if (!deletedAt) return '—';
    const d = new Date(deletedAt);
    d.setDate(d.getDate() + 30);
    return d.toLocaleDateString('ru-RU');
  }

  function token() {
    return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  }

  function syncSessionFromNode(opts?: { includeSensitivity?: boolean }) {
    if (!node?.model) {
      session.model = null;
      session.result = null;
      return;
    }
    const loadedMethod = node.solver_meta?.method;
    // Trace is never written to DB. After local solve → load(), keep the
    // in-memory frames and rebuild lastResponse from saved solver_meta so
    // «Подробнее» still has provenance (and does not flash empty).
    const lastResponse = responseFromSaved(node.result, node.solver_meta ?? null);
    const lastTrace = preserveTraceForMeta(session.lastTrace, node.solver_meta ?? null);
    session.hydrate({
      model: $state.snapshot(node.model),
      result: node.result,
      activeTab: isSolveMethod(loadedMethod) ? solveMethodToTab(loadedMethod) : session.activeTab,
      whatIfItems: [],
      lastResponse,
      lastTrace,
      lastWasCloud: node.solver_meta?.venue === 'cloud',
      // Keep the checkbox in sync with existing pack results on the saved task.
      includeSensitivity: opts?.includeSensitivity ?? session.includeSensitivity,
    });
  }

  async function loadUserOrgs() {
    if (!showOrgs) {
      userOrgs = [];
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      userOrgs = [];
      return;
    }
    const { data } = await supabase
      .from('organization_members')
      .select('org_id, organizations(id, name)')
      .eq('user_id', auth.user.id);
    userOrgs = (data ?? [])
      .map((row) => pickOrg(row.organizations as OrgJoin))
      .filter((o): o is OrgOption => o != null);
  }

  function toCachedNode(row: NodeRow): CachedSolveNode {
    return {
      id: row.id,
      title: row.title,
      kind: row.kind,
      model: row.model,
      result: row.result,
      parent_id: row.parent_id,
      what_if_generation: row.what_if_generation,
      active_what_if_generation: row.active_what_if_generation,
      deleted_at: row.deleted_at,
      mutation: row.mutation,
      org_id: row.org_id,
      org_visibility: row.org_visibility,
      is_favorite: row.is_favorite,
      owner_id: row.owner_id,
      solver_meta: row.solver_meta ?? null,
      updated_at: row.updated_at ?? null,
      created_at: row.created_at ?? null,
    };
  }

  async function writeTaskCache(dirty: boolean) {
    if (!node) return;
    await putCachedTask({
      id: node.id,
      title: node.title,
      root: toCachedNode(node),
      children: children.map(toCachedNode),
      dirty,
    });
  }

  function applyLoadedTree(root: NodeRow, kids: NodeRow[], opts?: { preserveSession?: boolean }) {
    node = root;
    children = kids;
    activeWhatIfGeneration = node.active_what_if_generation ?? null;
    orgId = node.org_id ?? userOrgs[0]?.id ?? '';
    makePublic = node.org_visibility === 'org';
    const hasSensitivityPack =
      children.some(isSensitivityChild) || node.active_what_if_generation != null;
    if (!opts?.preserveSession) {
      syncSessionFromNode({ includeSensitivity: hasSensitivityPack });
      error = '';
      pendingRetry = null;
    }
    genIndex = defaultPagerIndex(
      buildPagerSlots(collectGenerations(children), activeWhatIfGeneration, {
        includeEmptyCurrent: activeWhatIfGeneration == null && showEmptyCurrentSlot,
      }),
    );
  }

  function applyFromCacheRecord(rec: CachedTaskRecord, opts?: { preserveSession?: boolean }) {
    applyLoadedTree(rec.root as NodeRow, rec.children as NodeRow[], opts);
    if (rec.dirty && !opts?.preserveSession) {
      pendingRetry = 'save';
      error = t('taskSolveSaveOffline');
    }
  }

  async function load() {
    // Keep in-memory solve when a cloud save still needs retry.
    const preserveSession = pendingRetry === 'save' && session.model != null;
    const cached = await getCachedTask(id);
    try {
      if (isOnline()) {
        await refreshConnectivityProbe();
      }
      if (!isOnline() || isAppOffline()) {
        if (preserveSession && node) {
          await writeTaskCache(true);
          error = t('taskSolveSaveOffline');
          pendingRetry = 'save';
          return;
        }
        if (cached) {
          applyFromCacheRecord(cached);
          viewerId = cached.root.owner_id;
          shareUrl = '';
          shareGrants = [];
          hasActiveShare = false;
          return;
        }
        error = t('taskLoadOffline');
        pendingRetry = 'load';
        return;
      }

      const { data: auth, error: authErr } = await withTimeout(
        supabase.auth.getUser(),
        DEFAULT_NETWORK_TIMEOUT_MS,
      );
      if (authErr && isLikelyNetworkFailure(authErr)) {
        if (cached && !preserveSession) {
          applyFromCacheRecord(cached);
          viewerId = cached.root.owner_id;
          return;
        }
        error = preserveSession ? t('taskSolveSaveOffline') : t('taskLoadOffline');
        pendingRetry = preserveSession ? 'save' : 'load';
        return;
      }
      viewerId = auth.user?.id ?? null;
      const { data: root, error: e1 } = await withTimeout(
        supabase.from('solve_nodes').select('*').eq('id', id).maybeSingle(),
        DEFAULT_NETWORK_TIMEOUT_MS,
      );
      if (e1 || !root) {
        if (e1 && isLikelyNetworkFailure(e1)) {
          if (cached && !preserveSession) {
            applyFromCacheRecord(cached);
            return;
          }
          error = preserveSession ? t('taskSolveSaveOffline') : t('taskLoadOffline');
          pendingRetry = preserveSession ? 'save' : 'load';
          return;
        }
        error = e1?.message ?? t('notFound');
        pendingRetry = null;
        node = null;
        return;
      }

      const { data: kids, error: kidsErr } = await withTimeout(
        supabase
          .from('solve_nodes')
          .select('*')
          .eq('parent_id', id)
          .order('what_if_generation', { ascending: true }),
        DEFAULT_NETWORK_TIMEOUT_MS,
      );
      if (kidsErr && isLikelyNetworkFailure(kidsErr)) {
        if (cached && !preserveSession) {
          applyFromCacheRecord(cached);
          return;
        }
        error = preserveSession ? t('taskSolveSaveOffline') : t('taskLoadOffline');
        pendingRetry = preserveSession ? 'save' : 'load';
        return;
      }

      const rootRow = root as NodeRow;
      const kidRows = (kids ?? []) as NodeRow[];

      if (cached?.dirty && !preserveSession) {
        pendingServerLoad = { root: rootRow, kids: kidRows };
        pendingConflictCache = cached;
        conflictOpen = true;
        // Keep showing previous UI until the user chooses; hydrate cache if empty.
        if (!node) applyFromCacheRecord(cached);
        return;
      }

      if (preserveSession) {
        node = rootRow;
        children = kidRows;
        activeWhatIfGeneration = node.active_what_if_generation ?? null;
      } else {
        applyLoadedTree(rootRow, kidRows);
        await writeTaskCache(false);
      }

      if (viewerId && node && node.owner_id === viewerId) {
        await refreshShareState();
      } else {
        shareUrl = '';
        shareGrants = [];
        hasActiveShare = false;
      }
    } catch (e) {
      if (cached && !preserveSession) {
        applyFromCacheRecord(cached);
        return;
      }
      error = networkFailureMessage(
        e,
        preserveSession ? t('taskSolveSaveOffline') : t('taskLoadOffline'),
      );
      pendingRetry = preserveSession ? 'save' : 'load';
    }
  }

  async function resolveConflictKeepLocal() {
    if (pendingConflictCache) applyFromCacheRecord(pendingConflictCache);
    pendingServerLoad = null;
    pendingConflictCache = null;
  }

  async function resolveConflictTakeServer() {
    if (!pendingServerLoad) return;
    applyLoadedTree(pendingServerLoad.root, pendingServerLoad.kids);
    await writeTaskCache(false);
    pendingServerLoad = null;
    pendingConflictCache = null;
    if (viewerId && node && node.owner_id === viewerId) {
      await refreshShareState();
    }
  }

  afterNavigate(() => {
    session.loadRoundPref();
    void loadUserOrgs().then(() => load());
  });

  /** Persist current in-memory solve outcome without wiping session on failure. */
  async function persistSolveOutcome(
    model: Model,
    result: SolveResult | null,
    solverMeta: SolverMeta | null | undefined,
  ): Promise<boolean> {
    if (!node) return false;
    const stamp = new Date().toISOString();
    node = {
      ...node,
      model,
      result: result ?? null,
      solver_meta: solverMeta ?? null,
      updated_at: stamp,
    };
    try {
      const { error: upErr } = await withTimeout(
        supabase
          .from('solve_nodes')
          .update({
            model,
            result: result ?? null,
            solver_meta: solverMeta ?? null,
            updated_at: stamp,
          })
          .eq('id', node.id),
        DEFAULT_NETWORK_TIMEOUT_MS,
      );
      if (upErr) {
        error = networkFailureMessage(upErr, t('taskSolveSaveOffline'));
        session.error = '';
        pendingRetry = 'save';
        await writeTaskCache(true);
        return false;
      }
      error = '';
      session.error = '';
      pendingRetry = null;
      await writeTaskCache(false);
      return true;
    } catch (e) {
      error = networkFailureMessage(e, t('taskSolveSaveOffline'));
      session.error = '';
      pendingRetry = 'save';
      await writeTaskCache(true);
      return false;
    }
  }

  async function retryPending() {
    if (pendingRetry === 'load') {
      error = '';
      await load();
      return;
    }
    if (pendingRetry === 'save') {
      if (!session.model) return;
      error = '';
      session.error = '';
      const ok = await persistSolveOutcome(
        session.model,
        session.result,
        session.lastResponse?.solver_meta ?? node?.solver_meta,
      );
      if (!ok) return;
      // After a successful save retry, refresh kids/share if we can; keep session if reload fails.
      await load();
    }
  }

  /** Soft-delete live sensitivity + what_if_base kids. */
  async function softDeleteActiveSensitivity(): Promise<boolean> {
    if (!node) return false;
    const now = new Date().toISOString();
    const { error: softErr } = await supabase
      .from('solve_nodes')
      .update({ deleted_at: now })
      .eq('parent_id', node.id)
      .in('kind', [KIND_SENSITIVITY, KIND_WHAT_IF_BASE])
      .is('deleted_at', null);
    if (softErr) {
      error = softErr.message;
      return false;
    }
    return true;
  }

  async function setActiveWhatIfGeneration(next: number | null): Promise<boolean> {
    if (!node) return false;
    const { error: upErr } = await supabase
      .from('solve_nodes')
      .update({
        active_what_if_generation: next,
        updated_at: new Date().toISOString(),
      })
      .eq('id', node.id);
    if (upErr) {
      error = upErr.message;
      return false;
    }
    activeWhatIfGeneration = next;
    node = { ...node, active_what_if_generation: next };
    return true;
  }

  const taskTransport: SolveTransport = {
    solve: (model, method, opts) =>
      solveModel(model, {
        method,
        engine: opts?.engine,
        cloud: opts?.cloud,
        options: opts?.options,
      }),
    runMutations: (model, mutations, method, opts) =>
      runMutations(model, mutations, {
        method,
        engine: opts?.engine,
        cloud: opts?.cloud,
        options: opts?.options,
      }),
  };

  async function persistSensitivityKids(pack: RunMutationsResponse): Promise<boolean> {
    if (!node) return false;
    const nextGen = nextGenerationNumber(generations);
    if (!(await softDeleteActiveSensitivity())) return false;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      error = t('noSession');
      return false;
    }
    const baseRow = {
      owner_id: user.id,
      parent_id: node.id,
      org_id: node.org_id,
      org_visibility: node.org_visibility,
      kind: KIND_WHAT_IF_BASE,
      title: t('whatIf'),
      model: node.model,
      mutation: null,
      result: node.result,
      solver_meta: node.solver_meta ?? null,
      what_if_generation: nextGen,
    };
    const rows = pack.items.map((item) => ({
      owner_id: user.id,
      parent_id: node!.id,
      org_id: node!.org_id,
      org_visibility: node!.org_visibility,
      kind: KIND_SENSITIVITY,
      title: item.mutation.label ?? item.mutation.kind,
      model: item.model,
      mutation: item.mutation,
      result: item.response.result ?? null,
      solver_meta: item.response.solver_meta,
      what_if_generation: nextGen,
    }));
    const { error: insErr } = await supabase.from('solve_nodes').insert([baseRow, ...rows]);
    if (insErr) {
      error = insErr.message;
      return false;
    }
    return setActiveWhatIfGeneration(nextGen);
  }

  async function onVerifyReport(report: VerifyReport) {
    if (!report.anyMismatch || !node) return;
    const rows = [];
    if (report.root && report.root.diff.kind === 'mismatch') {
      rows.push({
        solve_node_id: node.id,
        method: 'lp',
        label: 'root',
        native_z: report.root.native.result?.Z ?? null,
        library_z: report.root.library.result?.Z ?? null,
        max_abs_dx: report.root.diff.maxAbsDx,
      });
    }
    for (const item of report.items) {
      if (item.diff.kind !== 'mismatch') continue;
      rows.push({
        solve_node_id: node.id,
        method: 'lp',
        label: item.label,
        native_z: item.native.result?.Z ?? null,
        library_z: item.library.result?.Z ?? null,
        max_abs_dx: item.diff.maxAbsDx,
      });
    }
    await logSolverMismatches(rows);
  }

  async function doSolve(cloud = false) {
    if (!node || !session.model || !session.methodReady) return;
    error = '';
    let persisted = false;
    const cycle = await session.runSolveCycle(taskTransport, {
      cloud,
      afterSolve: async ({ model, result, response }) => {
        const ok = await persistSolveOutcome(model, result ?? null, response.solver_meta);
        persisted = ok;
        return ok;
      },
      onVerify: onVerifyReport,
    });
    if (!cycle) {
      if (session.error) {
        const fromSession = session.error;
        error = networkFailureMessage(fromSession, t('taskSaveOffline'));
        // Page banner owns network/save retry — avoid duplicate InlineAlert in SolveWorkspace.
        if (isLikelyNetworkFailure(fromSession) || !isOnline()) {
          session.error = '';
          pendingRetry = 'save';
        }
      }
      return;
    }
    // Persist failed: keep local session model/result; do not reload from cloud.
    if (!persisted) {
      if (!error) error = session.error || t('taskSolveSaveOffline');
      session.error = '';
      pendingRetry = 'save';
      return;
    }

    if (session.includeSensitivity) {
      if (cycle.mutationsResponse?.status === 'done') {
        showEmptyCurrentSlot = false;
        const wiOk = await persistSensitivityKids(cycle.mutationsResponse);
        if (!wiOk) return;
        await load();
      } else if (!cycle.mutationsResponse) {
        // Sensitivity enabled but no mutation families → archive + empty current.
        if (
          whatIfChildren.some((c) => !c.deleted_at) ||
          children.some((c) => isWhatIfBase(c) && !c.deleted_at)
        ) {
          if (!(await softDeleteActiveSensitivity())) return;
        }
        showEmptyCurrentSlot = true;
        if (!(await setActiveWhatIfGeneration(null))) return;
        await load();
      }
    } else {
      showEmptyCurrentSlot = false;
      if (
        whatIfChildren.some((c) => !c.deleted_at) ||
        children.some((c) => isWhatIfBase(c) && !c.deleted_at)
      ) {
        if (!(await softDeleteActiveSensitivity())) return;
      }
      if (!(await setActiveWhatIfGeneration(null))) return;
      await load();
    }
  }

  async function restoreWhatIfBase() {
    if (!node || activeSlot?.kind !== 'generation' || !activeSlot.canRestore) {
      return;
    }
    const gen = activeSlot.generation;
    const base = findBaseForGeneration(children, gen);
    if (!base) {
      error = t('notFound');
      return;
    }
    session.busy = true;
    error = '';
    try {
      const now = new Date().toISOString();
      const { error: upRoot } = await supabase
        .from('solve_nodes')
        .update({
          model: base.model,
          result: base.result ?? null,
          solver_meta: base.solver_meta ?? null,
          active_what_if_generation: gen,
          updated_at: now,
        })
        .eq('id', node.id);
      if (upRoot) {
        error = upRoot.message;
        return;
      }

      const liveOthers = children.filter(
        (c) =>
          !c.deleted_at &&
          c.what_if_generation !== gen &&
          (isSensitivityChild(c) || isWhatIfBase(c)),
      );
      if (liveOthers.length) {
        const { error: softErr } = await supabase
          .from('solve_nodes')
          .update({ deleted_at: now })
          .in(
            'id',
            liveOthers.map((c) => c.id),
          );
        if (softErr) {
          error = softErr.message;
          return;
        }
      }

      const reviveIds = children
        .filter((c) => c.what_if_generation === gen && (isSensitivityChild(c) || isWhatIfBase(c)))
        .map((c) => c.id);
      if (reviveIds.length) {
        const { error: reviveErr } = await supabase
          .from('solve_nodes')
          .update({ deleted_at: null })
          .in('id', reviveIds);
        if (reviveErr) {
          error = reviveErr.message;
          return;
        }
      }

      await load();
    } finally {
      session.busy = false;
    }
  }

  async function attachOrg() {
    if (!node || !orgId) return;
    const vis = makePublic ? 'org' : 'private';
    const from = node.org_visibility;
    await supabase
      .from('solve_nodes')
      .update({ org_id: orgId, org_visibility: vis })
      .eq('id', node.id);
    await supabase
      .from('solve_nodes')
      .update({ org_id: orgId, org_visibility: vis })
      .eq('parent_id', node.id)
      .is('deleted_at', null);
    await writeAudit({
      action: 'visibility_change',
      entity_type: 'solve_node',
      entity_id: node.id,
      org_id: orgId,
      visibility_from: from,
      visibility_to: vis,
    });
    await load();
  }

  async function setOrgVisibility(vis: 'private' | 'org') {
    if (!node?.org_id) return;
    const from = node.org_visibility;
    await supabase.from('solve_nodes').update({ org_visibility: vis }).eq('id', node.id);
    await supabase
      .from('solve_nodes')
      .update({ org_visibility: vis })
      .eq('parent_id', node.id)
      .is('deleted_at', null);
    await writeAudit({
      action: 'visibility_change',
      entity_type: 'solve_node',
      entity_id: node.id,
      org_id: node.org_id,
      visibility_from: from,
      visibility_to: vis,
    });
    await load();
  }

  async function revokeAllShares() {
    if (!node) return;
    const now = new Date().toISOString();
    await supabase
      .from('share_links')
      .update({ revoked_at: now })
      .eq('node_id', node.id)
      .is('revoked_at', null);
    await supabase
      .from('share_grants')
      .update({ revoked_at: now })
      .eq('node_id', node.id)
      .is('revoked_at', null);
    await writeAudit({
      action: 'share_revoke',
      entity_type: 'solve_node',
      entity_id: node.id,
      org_id: node.org_id,
    });
    shareUrl = '';
    shareGrants = [];
    hasActiveShare = false;
  }

  function requestSoftDelete() {
    trashConfirmOpen = true;
  }

  function requestClearDraft() {
    clearConfirmOpen = true;
  }

  async function softDelete() {
    if (!node) return;
    await softDeleteSolveNode({ id: node.id, org_id: node.org_id });
    await goto('/app/trash');
  }

  async function clearTaskSourceData() {
    if (!node || !isEditable || session.busy) return;
    session.busy = true;
    error = '';
    try {
      const blank = createBlankModel();
      session.replaceModel(blank);
      if (!(await persistSolveOutcome(blank, null, null))) return;
      showEmptyCurrentSlot = false;
      if (!(await setActiveWhatIfGeneration(null))) return;
      // History only as «Прошлый» — no virtual empty «Текущий» until next sensitivity solve.
      const slots = buildPagerSlots(generations, null, { includeEmptyCurrent: false });
      genIndex = generations.length > 0 ? generations.length - 1 : defaultPagerIndex(slots);
    } finally {
      session.busy = false;
    }
  }

  async function toggleFavorite() {
    if (!node) return;
    await supabase.from('solve_nodes').update({ is_favorite: !node.is_favorite }).eq('id', node.id);
    await load();
  }

  async function createShareLink() {
    if (!node) return;
    shareMsg = '';
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (showOrgs && node.org_id) {
      shareMsg = t('shareOrgWarning');
    }
    const tok = token();
    const { error: e } = await supabase.from('share_links').insert({
      node_id: node.id,
      token: tok,
      created_by: user.id,
    });
    if (e) {
      shareMsg = e.message;
      return;
    }
    await writeAudit({
      action: 'share_create',
      entity_type: 'solve_node',
      entity_id: node.id,
      org_id: node.org_id,
    });
    shareUrl = `${location.origin}/share/${tok}`;
    hasActiveShare = true;
  }

  async function revokeShare() {
    if (!node) return;
    const now = new Date().toISOString();
    await supabase
      .from('share_links')
      .update({ revoked_at: now })
      .eq('node_id', node.id)
      .is('revoked_at', null);
    await writeAudit({
      action: 'share_revoke',
      entity_type: 'solve_node',
      entity_id: node.id,
      org_id: node.org_id,
    });
    await refreshShareState();
    shareMsg = t('shareRevoked');
  }

  async function revokeGrantOne(grantId: string) {
    if (!node) return;
    const now = new Date().toISOString();
    await supabase
      .from('share_grants')
      .update({ revoked_at: now })
      .eq('id', grantId)
      .eq('node_id', node.id);
    await writeAudit({
      action: 'share_revoke',
      entity_type: 'solve_node',
      entity_id: node.id,
      org_id: node.org_id,
    });
    await refreshShareState();
    shareMsg = t('accessClosed');
  }

  async function cancelSharing() {
    if (!node) return;
    session.busy = true;
    shareMsg = '';
    error = '';
    try {
      if (node.org_id) {
        await revokeAllShares();
        shareMsg = t('accessClosed');
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        error = t('noSession');
        return;
      }
      const { data: root, error: e1 } = await supabase
        .from('solve_nodes')
        .insert({
          owner_id: user.id,
          title: node.title,
          kind: 'root',
          model: node.model,
          result: node.result,
          solver_meta: node.solver_meta ?? null,
          active_what_if_generation: activeWhatIfGeneration != null ? 1 : null,
          org_id: null,
          org_visibility: null,
          ...taskForkProvenance(node.id, node.title, node.result),
        })
        .select('id')
        .single();
      if (e1 || !root) {
        error = e1?.message ?? 'fork failed';
        return;
      }
      const copyGen = activeWhatIfGeneration ?? generations.at(-1) ?? null;
      const activeKids = whatIfChildren.filter(
        (c) => c.what_if_generation === copyGen && !c.deleted_at,
      );
      const activeBase =
        copyGen != null
          ? children.find(
              (c) => isWhatIfBase(c) && c.what_if_generation === copyGen && !c.deleted_at,
            )
          : null;
      const forkKids = [];
      if (activeBase) {
        forkKids.push({
          owner_id: user.id,
          parent_id: root.id,
          kind: KIND_WHAT_IF_BASE,
          title: activeBase.title,
          model: activeBase.model,
          mutation: null,
          result: activeBase.result,
          solver_meta: activeBase.solver_meta ?? null,
          what_if_generation: 1,
          org_id: null,
          org_visibility: null,
        });
      }
      for (const c of activeKids) {
        forkKids.push({
          owner_id: user.id,
          parent_id: root.id,
          kind: KIND_SENSITIVITY,
          title: c.title,
          model: c.model,
          mutation: c.mutation,
          result: c.result,
          solver_meta: c.solver_meta ?? null,
          what_if_generation: 1,
          org_id: null,
          org_visibility: null,
        });
      }
      if (forkKids.length) {
        await supabase.from('solve_nodes').insert(forkKids);
      }
      await revokeAllShares();
      const now = new Date().toISOString();
      await supabase.from('solve_nodes').update({ deleted_at: now }).eq('id', node.id);
      await writeAudit({
        action: 'soft_delete',
        entity_type: 'solve_node',
        entity_id: node.id,
        org_id: node.org_id,
      });
      await writeAudit({
        action: 'fork',
        entity_type: 'solve_node',
        entity_id: root.id,
      });
      await goto(`/app/task/${root.id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      session.busy = false;
    }
  }

  async function refreshShareState() {
    if (!node) return;
    const nodeId = node.id;
    const { data: links } = await supabase
      .from('share_links')
      .select('token')
      .eq('node_id', nodeId)
      .is('revoked_at', null);
    const { data: grants } = await supabase
      .from('share_grants')
      .select('id, grantee_id')
      .eq('node_id', nodeId)
      .is('revoked_at', null);
    const grantRows = grants ?? [];
    const granteeIds = [...new Set(grantRows.map((g) => g.grantee_id))];
    const nameById = new Map<string, string>();
    if (granteeIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', granteeIds);
      for (const p of profiles ?? []) {
        const name = typeof p.display_name === 'string' ? p.display_name.trim() : '';
        nameById.set(p.id, name || t('commentsAuthorFallback'));
      }
    }
    shareGrants = grantRows.map((g) => ({
      id: g.id,
      grantee_id: g.grantee_id,
      label: nameById.get(g.grantee_id) ?? t('commentsAuthorFallback'),
    }));
    hasActiveShare = Boolean(links?.length || shareGrants.length);
    shareUrl = links?.[0] ? `${location.origin}/share/${links[0].token}` : '';
  }

  async function grantToEmail() {
    if (!node || !grantEmail.trim()) return;
    shareMsg = '';
    const identifier = grantEmail.trim();
    if (classifyShareIdentifier(identifier) === 'invalid') {
      toast.error(t('grantInvalidIdentifier'));
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (isSelfShareIdentifier(identifier, { id: user.id, email: user.email })) {
      toast.error(t('grantSelfForbidden'));
      return;
    }
    const { error: e } = await supabase.rpc('share_grant_by_identifier', {
      p_node_id: node.id,
      p_identifier: identifier,
    });
    if (e) {
      const msg = e.message ?? '';
      if (msg.includes('invalid_identifier')) {
        toast.error(t('grantInvalidIdentifier'));
        return;
      }
      if (msg.includes('self_grant')) {
        toast.error(t('grantSelfForbidden'));
        return;
      }
      shareMsg = msg || t('grantHint');
      return;
    }
    grantEmail = '';
    await refreshShareState();
    toast.success(t('shareGranted'));
  }

  async function forkNode() {
    if (!node) return;
    session.busy = true;
    error = '';
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: root, error: e1 } = await supabase
        .from('solve_nodes')
        .insert({
          owner_id: user.id,
          title: `${node.title} (копия)`,
          kind: 'root',
          model: node.model,
          result: node.result,
          solver_meta: node.solver_meta ?? null,
          active_what_if_generation: activeWhatIfGeneration != null ? 1 : null,
          org_id: null,
          org_visibility: null,
          ...taskForkProvenance(node.id, node.title, node.result),
        })
        .select('id')
        .single();
      if (e1 || !root) {
        error = e1?.message ?? 'fork failed';
        return;
      }
      const copyGen = activeWhatIfGeneration ?? generations.at(-1) ?? null;
      const activeKids = whatIfChildren.filter(
        (c) => c.what_if_generation === copyGen && !c.deleted_at,
      );
      const activeBase =
        copyGen != null
          ? children.find(
              (c) => isWhatIfBase(c) && c.what_if_generation === copyGen && !c.deleted_at,
            )
          : null;
      const forkKids = [];
      if (activeBase) {
        forkKids.push({
          owner_id: user.id,
          parent_id: root.id,
          kind: KIND_WHAT_IF_BASE,
          title: activeBase.title,
          model: activeBase.model,
          mutation: null,
          result: activeBase.result,
          solver_meta: activeBase.solver_meta ?? null,
          what_if_generation: 1,
          org_id: null,
          org_visibility: null,
        });
      }
      for (const c of activeKids) {
        forkKids.push({
          owner_id: user.id,
          parent_id: root.id,
          kind: KIND_SENSITIVITY,
          title: c.title,
          model: c.model,
          mutation: c.mutation,
          result: c.result,
          solver_meta: c.solver_meta ?? null,
          what_if_generation: 1,
          org_id: null,
          org_visibility: null,
        });
      }
      if (forkKids.length) {
        await supabase.from('solve_nodes').insert(forkKids);
      }
      await writeAudit({
        action: 'fork',
        entity_type: 'solve_node',
        entity_id: root.id,
      });
      toast.success(t('forkDone'));
      await goto(`/app/task/${root.id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      session.busy = false;
    }
  }

  /** Append one interactive scenario into the active what-if generation (or create gen 1). */
  async function appendSensitivityChild(payload: InteractiveScenarioPayload): Promise<void> {
    if (!node || whatIfBadge === 'past') return;
    const { row, result, solver_meta } = payload;
    if (
      hasMutation(
        visibleChildren.map((c) => c.mutation),
        row.mutation,
      )
    ) {
      error = t('whatIfDuplicateHint');
      return;
    }
    session.busy = true;
    error = '';
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        error = t('noSession');
        return;
      }

      if (activeWhatIfGeneration == null) {
        const nextGen = nextGenerationNumber(generations);
        const baseModel = interactiveBaseModel ?? node.model;
        const baseResult = interactiveBaseResult ?? node.result;
        const baseMeta = session.lastResponse?.solver_meta ?? node.solver_meta ?? null;
        const baseRow = {
          owner_id: user.id,
          parent_id: node.id,
          org_id: node.org_id,
          org_visibility: node.org_visibility,
          kind: KIND_WHAT_IF_BASE,
          title: t('whatIf'),
          model: baseModel,
          mutation: null,
          result: baseResult,
          solver_meta: baseMeta,
          what_if_generation: nextGen,
        };
        const sensRow = {
          owner_id: user.id,
          parent_id: node.id,
          org_id: node.org_id,
          org_visibility: node.org_visibility,
          kind: KIND_SENSITIVITY,
          title: row.title,
          model: row.mutatedModel,
          mutation: row.mutation,
          result,
          solver_meta,
          what_if_generation: nextGen,
        };
        const { error: insErr } = await supabase.from('solve_nodes').insert([baseRow, sensRow]);
        if (insErr) {
          error = insErr.message;
          return;
        }
        if (!(await setActiveWhatIfGeneration(nextGen))) return;
      } else {
        const gen = activeWhatIfGeneration;
        const { error: insErr } = await supabase.from('solve_nodes').insert({
          owner_id: user.id,
          parent_id: node.id,
          org_id: node.org_id,
          org_visibility: node.org_visibility,
          kind: KIND_SENSITIVITY,
          title: row.title,
          model: row.mutatedModel,
          mutation: row.mutation,
          result,
          solver_meta,
          what_if_generation: gen,
        });
        if (insErr) {
          error = insErr.message;
          return;
        }
      }
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      session.busy = false;
    }
  }

  /** Create a new root task from one sensitivity scenario (mutated model + result + provenance). */
  async function createTaskFromScenario(row: WhatIfRow) {
    if (!node) return;
    session.busy = true;
    error = '';
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        error = t('noSession');
        return;
      }
      const child = visibleChildren.find(
        (c) =>
          c.mutation &&
          row.mutation &&
          c.mutation.kind === row.mutation.kind &&
          c.mutation.target === row.mutation.target &&
          c.mutation.delta === row.mutation.delta,
      );
      const title = `${node.title} · ${row.title}`;
      const scenarioResult =
        child?.result ??
        ({
          x: row.plan,
          Z: row.Z,
          resource_usage: {},
          resource_slack: {},
          shadow_prices: {},
          critical_resources: row.criticalResources,
          non_critical_resources: [],
          feasible: true,
        } as const);
      const provenance = child?.id
        ? mutationForkProvenance(child.id, node.title, row.title, scenarioResult)
        : null;
      const { data: root, error: e1 } = await supabase
        .from('solve_nodes')
        .insert({
          owner_id: user.id,
          title,
          kind: 'root',
          model: row.mutatedModel,
          result: scenarioResult,
          solver_meta: child?.solver_meta ?? node.solver_meta ?? null,
          org_id: null,
          org_visibility: null,
          ...(provenance ?? {}),
        })
        .select('id')
        .single();
      if (e1 || !root) {
        error = e1?.message ?? 'create failed';
        return;
      }
      await writeAudit({
        action: 'fork',
        entity_type: 'solve_node',
        entity_id: root.id,
      });
      await goto(`/app/task/${root.id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      session.busy = false;
    }
  }

  function updateWhatIf(field: keyof WhatIfDefaults, raw: string) {
    session.updateWhatIf(field, raw);
  }

  function onModelChange(next: Model) {
    session.replaceModel(next);
    if (!node) return;
    const baseModel =
      activeWhatIfGeneration != null
        ? findBaseForGeneration(children, activeWhatIfGeneration)?.model
        : null;
    const nextActive = resolveActiveAfterModelEdit(activeWhatIfGeneration, baseModel, next);
    if (nextActive === activeWhatIfGeneration) return;
    void (async () => {
      showEmptyCurrentSlot = false;
      if (!(await setActiveWhatIfGeneration(nextActive))) return;
      genIndex = defaultPagerIndex(
        buildPagerSlots(generations, nextActive, { includeEmptyCurrent: false }),
      );
    })();
  }

  /** Rename allowed even after solve (title-only update). */
  async function renameNode(nextTitle: string) {
    if (!node) return;
    const title = nextTitle.trim();
    if (!title || title === node.title) return;
    const stamp = new Date().toISOString();
    const { error: upErr } = await supabase
      .from('solve_nodes')
      .update({ title, updated_at: stamp })
      .eq('id', node.id);
    if (upErr) {
      error = networkFailureMessage(upErr, t('taskSaveOffline')) || t('titleSaveFailed');
      return;
    }
    node = { ...node, title, updated_at: stamp };
  }
</script>

<svelte:window onclick={closeActionsMenu} />

{#if !node}
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-3">
    {#if error}
      <InlineAlert>{error}</InlineAlert>
      {#if pendingRetry}
        <div>
          <Button variant="secondary" disabled={session.busy} onclick={() => void retryPending()}>
            {t('retry')}
          </Button>
        </div>
      {/if}
    {:else}
      <p class="text-text-muted">…</p>
    {/if}
  </section>
{:else}
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-6">
    <PageHeader
      title={node.title}
      meta={headerMeta}
      description={!isEditable && !isOwner ? t('sharedViewerHint') : undefined}
      editable={isEditable}
      ontitlecommit={renameNode}
    >
      {#snippet actions()}
        <div class="hidden md:contents">
          {#if isEditable}
            <Button
              variant="secondary"
              class="px-2.5! py-2.5!"
              disabled={session.busy}
              aria-label={t('clearDraft')}
              title={t('clearTaskHint')}
              onclick={requestClearDraft}
            >
              <Eraser size={18} strokeWidth={1.75} aria-hidden="true" />
            </Button>
            {@const favoriteLabel = node!.is_favorite ? t('unfavorite') : t('favorite')}
            <Button
              variant="secondary"
              class="px-2.5! py-2.5!"
              disabled={session.busy}
              aria-label={favoriteLabel}
              title={favoriteLabel}
              onclick={toggleFavorite}
            >
              <Star
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
                class={node!.is_favorite ? 'text-amber-400' : 'text-text-soft'}
                fill={node!.is_favorite ? 'currentColor' : 'none'}
              />
            </Button>
          {/if}
          <Button
            variant="secondary"
            class={!isEditable ? '' : 'px-2.5! py-2.5!'}
            disabled={session.busy}
            aria-label={t('fork')}
            title={t('fork')}
            onclick={forkNode}
          >
            <GitFork size={18} strokeWidth={1.75} aria-hidden="true" />
            {#if !isEditable}
              {t('fork')}
            {/if}
          </Button>
          {#if isOwner}
            <Button
              variant="danger"
              class="px-2.5! py-2.5!"
              disabled={session.busy}
              aria-label={t('trashToBin')}
              title={t('trashToBin')}
              onclick={requestSoftDelete}
            >
              <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
            </Button>
          {/if}
        </div>

        <div class="relative md:hidden">
          <Button
            variant="secondary"
            class="px-2.5! py-2.5!"
            disabled={session.busy}
            aria-label={t('taskMoreActions')}
            title={t('taskMoreActions')}
            aria-expanded={actionsMenuOpen}
            aria-haspopup="menu"
            onclick={(e) => {
              e.stopPropagation();
              actionsMenuOpen = !actionsMenuOpen;
            }}
          >
            <EllipsisVertical size={18} strokeWidth={1.75} aria-hidden="true" />
          </Button>
          {#if actionsMenuOpen}
            <div
              role="menu"
              tabindex="-1"
              class="absolute right-0 z-20 mt-1 min-w-56 rounded-[8px] border border-border bg-bg py-1 shadow-lg"
              onpointerdown={(e) => e.stopPropagation()}
            >
              {#if isEditable}
                <button
                  type="button"
                  role="menuitem"
                  class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg-soft disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={session.busy}
                  title={t('clearTaskHint')}
                  onclick={() => {
                    closeActionsMenu();
                    requestClearDraft();
                  }}
                >
                  <Eraser size={16} strokeWidth={1.75} aria-hidden="true" />
                  {t('clearDraft')}
                </button>
                {@const favoriteLabel = node!.is_favorite ? t('unfavorite') : t('favorite')}
                <button
                  type="button"
                  role="menuitem"
                  class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg-soft disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={session.busy}
                  onclick={() => {
                    closeActionsMenu();
                    toggleFavorite();
                  }}
                >
                  <Star
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    class={node!.is_favorite ? 'text-amber-400' : 'text-text-soft'}
                    fill={node!.is_favorite ? 'currentColor' : 'none'}
                  />
                  {favoriteLabel}
                </button>
              {/if}
              <button
                type="button"
                role="menuitem"
                class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg-soft disabled:cursor-not-allowed disabled:opacity-50"
                disabled={session.busy}
                onclick={() => {
                  closeActionsMenu();
                  forkNode();
                }}
              >
                <GitFork size={16} strokeWidth={1.75} aria-hidden="true" />
                {t('fork')}
              </button>
              {#if isOwner}
                <button
                  type="button"
                  role="menuitem"
                  class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-danger-text hover:bg-bg-soft disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={session.busy}
                  onclick={() => {
                    closeActionsMenu();
                    requestSoftDelete();
                  }}
                >
                  <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                  {t('trashToBin')}
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/snippet}
    </PageHeader>

    {#if error}
      <div class="flex flex-wrap items-center gap-3">
        <InlineAlert class="min-w-0 flex-1">{error}</InlineAlert>
        {#if pendingRetry}
          <Button variant="secondary" disabled={session.busy} onclick={() => void retryPending()}>
            {t('retry')}
          </Button>
        {/if}
      </div>
    {/if}

    {#if isEditable}
      {#if session.model}
        <SolveWorkspace
          {session}
          title={node.title}
          {solverLibrary}
          showCloudSplit
          whatIfRows={showWhatIfChrome ? whatIfRows : []}
          whatIfGenerationIndex={genIndex}
          whatIfGenerationCount={showWhatIfChrome ? pagerSlots.length : 0}
          whatIfCurrentGenerationIndex={showWhatIfChrome ? currentPagerIndex : null}
          onWhatIfGenerationChange={(i) => (genIndex = i)}
          whatIfActiveHint={activeSlot?.badge === 'current' && activeSlot.kind === 'generation'
            ? t('generationActiveHint')
            : undefined}
          {whatIfArchiveHint}
          whatIfBadge={showWhatIfChrome ? whatIfBadge : null}
          whatIfEmptyMessage={showWhatIfChrome ? whatIfEmptyMessage : null}
          whatIfBaseModel={showWhatIfChrome ? (generationBase?.model ?? null) : null}
          whatIfShowRestore={showWhatIfChrome && whatIfShowRestore}
          onWhatIfRestore={() => void restoreWhatIfBase()}
          onCreateTaskFromScenario={(row) => void createTaskFromScenario(row)}
          onCompareScenario={(row) => {
            if (!node || !row.nodeId) return;
            const q = formatCompareIds([node.id, row.nodeId]);
            void goto(`/app/compare?ids=${encodeURIComponent(q)}`);
          }}
          {interactiveBaseModel}
          {interactiveBaseResult}
          interactiveMethod={session.solveMethod}
          interactiveTransport={taskTransport}
          {interactiveTransportOpts}
          {interactiveExistingMutations}
          interactiveBusy={session.busy}
          onAddInteractiveToTable={(payload) => void appendSensitivityChild(payload)}
          {onModelChange}
          onWhatIfChange={updateWhatIf}
          onSolve={() => void doSolve(false)}
          onSolveCloud={() => void doSolve(true)}
        ></SolveWorkspace>
        <Card>
          <NodeComments nodeId={node.id} isNodeOwner />
        </Card>
      {:else}
        <Card>
          <p class="text-sm text-text-muted">{t('modelMatrix')}</p>
          <p class="mt-2 text-sm text-danger-text">{t('notFound')}</p>
        </Card>
      {/if}

      {#if showOrgs}
        <OrgAttachPanel
          bind:orgId
          bind:makePublic
          orgOptions={orgSelectOptions}
          attachedOrgId={node.org_id}
          onAttach={attachOrg}
          onSetVisibility={setOrgVisibility}
        />
      {/if}
    {:else}
      <SharedTaskViewer
        title={node.title}
        model={node.model}
        result={node.result}
        {children}
        nodeId={node.id}
        isNodeOwner={isOwner}
        hint={isOwner ? t('accessLockedHint') : ''}
        busy={session.busy}
        showFork={false}
      />
    {/if}

    {#if isOwner}
      <SharePanel
        {shareUrl}
        grants={shareGrants}
        busy={session.busy}
        bind:grantValue={grantEmail}
        message={shareMsg}
        showOrgWarning={showOrgs && Boolean(node.org_id)}
        onCreateLink={createShareLink}
        onRevokeLink={revokeShare}
        onCancelSharing={cancelSharing}
        onGrant={grantToEmail}
        onRevokeGrant={revokeGrantOne}
      />
    {/if}

    {#if isEditable && node.result}
      <button
        type="button"
        class="fixed right-5 bottom-5 z-50 flex size-14 cursor-pointer items-center justify-center rounded-full bg-accent text-white shadow-lg transition-colors hover:bg-text-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2"
        aria-label={t('compareFabLabel')}
        title={t('compareFabLabel')}
        onclick={() => {
          const q = formatCompareIds([node!.id]);
          void goto(`/app/compare?ids=${encodeURIComponent(q)}`);
        }}
      >
        <GitCompareArrows size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>
    {/if}
  </section>

  <ConfirmModal
    bind:open={trashConfirmOpen}
    title={t('confirmTrashTitle')}
    body={node ? t('confirmTrashBody', { title: node.title }) : ''}
    confirmLabel={t('trashToBin')}
    onconfirm={softDelete}
  />

  <ConfirmModal
    bind:open={clearConfirmOpen}
    title={t('confirmClearTaskTitle')}
    body={t('confirmClearTaskBody')}
    confirmLabel={t('clearDraft')}
    busy={session.busy}
    onconfirm={clearTaskSourceData}
  />

  <ChoiceModal
    bind:open={conflictOpen}
    title={t('taskConflictTitle')}
    body={t('taskConflictBody')}
    primaryLabel={t('taskConflictKeepLocal')}
    secondaryLabel={t('taskConflictTakeServer')}
    onprimary={resolveConflictKeepLocal}
    onsecondary={resolveConflictTakeServer}
  />
{/if}
