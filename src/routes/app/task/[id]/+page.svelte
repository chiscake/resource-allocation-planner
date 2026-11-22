<script lang="ts">
  import { page } from "$app/state";
  import { afterNavigate, goto } from "$app/navigation";
  import { env } from "$env/dynamic/public";
  import { isOrgsUiEnabled } from "$lib/features";
  import { toast } from "svelte-sonner";
  import { supabase } from "$lib/db/supabase";
  import { writeAudit } from "$lib/db/audit";
  import {
    classifyShareIdentifier,
    isSelfShareIdentifier,
  } from "$lib/db/share-grant";
  import { softDeleteSolveNode } from "$lib/db/soft-delete";
  import { solveModel, runMutations } from "$lib/api/solve";
  import { logSolverMismatches } from "$lib/db/solver-mismatch";
  import {
    cloneModel,
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
  } from "$lib/domain";
  import { maybeRoundPlan } from "$lib/display";
  import { t } from "$lib/i18n";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import SolveWorkspace from "$lib/components/model/SolveWorkspace.svelte";
  import NodeComments from "$lib/components/NodeComments.svelte";
  import OrgAttachPanel from "$lib/components/OrgAttachPanel.svelte";
  import SharePanel from "$lib/components/SharePanel.svelte";
  import InlineAlert from "$lib/components/ui/InlineAlert.svelte";
  import {
    createSolveSession,
    solveMethodToTab,
    type SolveTransport,
    type WhatIfRow,
  } from "$lib/components/model/solve-session.svelte";
  import type { InteractiveScenarioPayload } from "$lib/components/model/interactive-preview.svelte";
  import { resolveSolveMode } from "$lib/solver/mode";
  import type { VerifyReport } from "$lib/solver/verify";
  import { Star, GitFork, Trash2 } from "@lucide/svelte";

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
    org_visibility: "private" | "org" | null;
    is_favorite: boolean;
    owner_id: string;
    solver_meta?: SolverMeta | null;
  };

  type OrgOption = { id: string; name: string };
  type OrgJoin =
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;

  function pickOrg(raw: OrgJoin): OrgOption | null {
    if (!raw) return null;
    const org = Array.isArray(raw) ? raw[0] : raw;
    return org ? { id: org.id, name: org.name } : null;
  }

  let node = $state<NodeRow | null>(null);
  let children = $state<NodeRow[]>([]);
  let activeWhatIfGeneration = $state<number | null>(null);
  let genIndex = $state(0);
  let error = $state("");
  let orgId = $state("");
  let makePublic = $state(false);
  let shareUrl = $state("");
  let grantEmail = $state("");
  let shareMsg = $state("");
  let userOrgs = $state<OrgOption[]>([]);
  let hasActiveShare = $state(false);
  const session = createSolveSession();
  const showOrgs = isOrgsUiEnabled(env.PUBLIC_SHOW_ORGS);

  const id = $derived(page.params.id!);
  const solverLibrary = $derived(
    typeof node?.solver_meta?.library === "string"
      ? node.solver_meta.library
      : null,
  );
  const generations = $derived(collectGenerations(children));
  const pagerSlots = $derived(
    buildPagerSlots(generations, activeWhatIfGeneration),
  );
  const activeSlot = $derived(pagerSlots[genIndex] ?? null);
  const currentPagerIndex = $derived(
    pagerSlots.findIndex((s) => s.badge === "current"),
  );
  const activeGen = $derived(
    activeSlot?.kind === "generation" ? activeSlot.generation : null,
  );
  const whatIfChildren = $derived(children.filter(isSensitivityChild));
  const visibleChildren = $derived(
    activeGen != null ? sensitivityForGeneration(children, activeGen) : [],
  );
  const generationBase = $derived(
    activeGen != null ? findBaseForGeneration(children, activeGen) : null,
  );
  const whatIfRows = $derived<WhatIfRow[]>(
    visibleChildren.flatMap((c) => {
      if (!c.mutation || !node) return [];
      const baseModel = generationBase?.model ?? node.model;
      const baseResult = generationBase?.result ?? node.result;
      const continuous = c.result;
      const row = buildWhatIfRowData({
        base: baseModel,
        baseResult,
        mutation: c.mutation,
        mutatedModel: c.model,
        result: continuous,
        valuesFromMutated: true,
      });
      if (continuous && session.roundPlan) {
        const display = maybeRoundPlan(c.model, continuous, true);
        const baseZ = baseResult?.Z;
        return [
          {
            ...row,
            Z: display.Z,
            deltaZ:
              baseZ != null && Number.isFinite(baseZ)
                ? display.Z - baseZ
                : row.deltaZ,
            plan: display.x,
            shadowMetric:
              row.shadowKind === "modernization" && baseZ != null
                ? continuous.Z - baseZ
                : row.shadowMetric,
          },
        ];
      }
      return [row];
    }),
  );
  const whatIfEmptyMessage = $derived(
    activeSlot?.kind === "empty_current" ? t("whatIfNotRun") : null,
  );
  const whatIfBadge = $derived(activeSlot?.badge ?? null);
  const whatIfShowRestore = $derived(
    Boolean(activeSlot?.kind === "generation" && activeSlot.canRestore),
  );
  const whatIfArchiveHint = $derived(
    activeSlot?.badge === "past"
      ? t("generationPurge", {
          date: purgeDate(
            children.find(
              (c) => c.what_if_generation === activeGen && c.deleted_at != null,
            )?.deleted_at ?? null,
          ),
        })
      : "",
  );
  const showWhatIfChrome = $derived(
    Boolean(session.result) &&
      (generations.length > 0 || activeWhatIfGeneration === null),
  );
  /** Interactive explorer base: active gen snapshot, else current root. */
  const interactiveBaseModel = $derived(
    showWhatIfChrome
      ? (generationBase?.model ?? session.model ?? node?.model ?? null)
      : null,
  );
  const interactiveBaseResult = $derived(
    showWhatIfChrome
      ? (generationBase?.result ?? session.result ?? node?.result ?? null)
      : null,
  );
  const interactiveExistingMutations = $derived(
    visibleChildren.map((c) => c.mutation),
  );
  const interactiveTransportOpts = $derived({
    engine: resolveSolveMode(session.solveMethod, session.lastWasCloud).engine,
    cloud: session.lastWasCloud,
    options: session.buildRunOptions(session.solveMethod),
  });
  const orgSelectOptions = $derived(
    userOrgs.map((o) => ({ value: o.id, label: o.name })),
  );

  function purgeDate(deletedAt: string | null): string {
    if (!deletedAt) return "—";
    const d = new Date(deletedAt);
    d.setDate(d.getDate() + 30);
    return d.toLocaleDateString("ru-RU");
  }

  function token() {
    return (
      crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "")
    );
  }

  function syncSessionFromNode() {
    if (!node?.model) {
      session.model = null;
      session.result = null;
      return;
    }
    const loadedMethod = node.solver_meta?.method;
    session.hydrate({
      model: $state.snapshot(node.model),
      result: node.result,
      activeTab: isSolveMethod(loadedMethod)
        ? solveMethodToTab(loadedMethod)
        : session.activeTab,
      whatIfItems: [],
      lastWasCloud: node.solver_meta?.venue === "cloud",
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
      .from("organization_members")
      .select("org_id, organizations(id, name)")
      .eq("user_id", auth.user.id);
    userOrgs = (data ?? [])
      .map((row) => pickOrg(row.organizations as OrgJoin))
      .filter((o): o is OrgOption => o != null);
  }

  async function load() {
    const { data: root, error: e1 } = await supabase
      .from("solve_nodes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (e1 || !root) {
      error = e1?.message ?? t("notFound");
      return;
    }
    node = root as NodeRow;
    activeWhatIfGeneration = node.active_what_if_generation ?? null;
    syncSessionFromNode();
    orgId = node.org_id ?? userOrgs[0]?.id ?? "";
    makePublic = node.org_visibility === "org";
    const { data: kids } = await supabase
      .from("solve_nodes")
      .select("*")
      .eq("parent_id", id)
      .order("what_if_generation", { ascending: true });
    children = (kids ?? []) as NodeRow[];
    genIndex = defaultPagerIndex(
      buildPagerSlots(collectGenerations(children), activeWhatIfGeneration),
    );

    await refreshShareState();
  }

  afterNavigate(() => {
    session.loadRoundPref();
    void loadUserOrgs().then(() => load());
  });

  async function persistModel(model: Model) {
    if (!node) return false;
    const { error: upErr } = await supabase
      .from("solve_nodes")
      .update({ model, updated_at: new Date().toISOString() })
      .eq("id", node.id);
    if (upErr) {
      error = upErr.message;
      session.error = upErr.message;
      return false;
    }
    node = { ...node, model };
    session.replaceModel(model, { clearDerived: false });
    return true;
  }

  /** Soft-delete live sensitivity + what_if_base kids. */
  async function softDeleteActiveSensitivity(): Promise<boolean> {
    if (!node) return false;
    const now = new Date().toISOString();
    const { error: softErr } = await supabase
      .from("solve_nodes")
      .update({ deleted_at: now })
      .eq("parent_id", node.id)
      .in("kind", [KIND_SENSITIVITY, KIND_WHAT_IF_BASE])
      .is("deleted_at", null);
    if (softErr) {
      error = softErr.message;
      return false;
    }
    return true;
  }

  async function setActiveWhatIfGeneration(
    next: number | null,
  ): Promise<boolean> {
    if (!node) return false;
    const { error: upErr } = await supabase
      .from("solve_nodes")
      .update({
        active_what_if_generation: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", node.id);
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

  async function persistSensitivityKids(
    pack: RunMutationsResponse,
  ): Promise<boolean> {
    if (!node) return false;
    const nextGen = nextGenerationNumber(generations);
    if (!(await softDeleteActiveSensitivity())) return false;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      error = t("noSession");
      return false;
    }
    const baseRow = {
      owner_id: user.id,
      parent_id: node.id,
      org_id: node.org_id,
      org_visibility: node.org_visibility,
      kind: KIND_WHAT_IF_BASE,
      title: t("whatIf"),
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
    const { error: insErr } = await supabase
      .from("solve_nodes")
      .insert([baseRow, ...rows]);
    if (insErr) {
      error = insErr.message;
      return false;
    }
    return setActiveWhatIfGeneration(nextGen);
  }

  async function onVerifyReport(report: VerifyReport) {
    if (!report.anyMismatch || !node) return;
    const rows = [];
    if (report.root && !report.root.diff.match) {
      rows.push({
        solve_node_id: node.id,
        method: "lp",
        label: "root",
        native_z: report.root.native.result?.Z ?? null,
        library_z: report.root.library.result?.Z ?? null,
        max_abs_dx: report.root.diff.maxAbsDx,
      });
    }
    for (const item of report.items) {
      if (item.diff.match) continue;
      rows.push({
        solve_node_id: node.id,
        method: "lp",
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
    error = "";
    const cycle = await session.runSolveCycle(taskTransport, {
      cloud,
      afterSolve: async ({ model, result, response }) => {
        const ok = await persistModel(model);
        if (!ok) return false;
        const { error: upErr } = await supabase
          .from("solve_nodes")
          .update({
            model,
            result: result ?? null,
            solver_meta: response.solver_meta,
            updated_at: new Date().toISOString(),
          })
          .eq("id", node!.id);
        if (upErr) {
          error = upErr.message;
          session.error = upErr.message;
          return false;
        }
        node = {
          ...node!,
          model,
          result: result ?? null,
          solver_meta: response.solver_meta,
        };
        return true;
      },
      onVerify: onVerifyReport,
    });
    if (!cycle) {
      if (session.error) error = session.error;
      return;
    }

    if (session.includeSensitivity) {
      if (cycle.mutationsResponse?.status === "done") {
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
        if (!(await setActiveWhatIfGeneration(null))) return;
        await load();
      }
    } else {
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
    if (!node || activeSlot?.kind !== "generation" || !activeSlot.canRestore) {
      return;
    }
    const gen = activeSlot.generation;
    const base = findBaseForGeneration(children, gen);
    if (!base) {
      error = t("notFound");
      return;
    }
    session.busy = true;
    error = "";
    try {
      const now = new Date().toISOString();
      const { error: upRoot } = await supabase
        .from("solve_nodes")
        .update({
          model: base.model,
          result: base.result ?? null,
          solver_meta: base.solver_meta ?? null,
          active_what_if_generation: gen,
          updated_at: now,
        })
        .eq("id", node.id);
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
          .from("solve_nodes")
          .update({ deleted_at: now })
          .in(
            "id",
            liveOthers.map((c) => c.id),
          );
        if (softErr) {
          error = softErr.message;
          return;
        }
      }

      const reviveIds = children
        .filter(
          (c) =>
            c.what_if_generation === gen &&
            (isSensitivityChild(c) || isWhatIfBase(c)),
        )
        .map((c) => c.id);
      if (reviveIds.length) {
        const { error: reviveErr } = await supabase
          .from("solve_nodes")
          .update({ deleted_at: null })
          .in("id", reviveIds);
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
    const vis = makePublic ? "org" : "private";
    const from = node.org_visibility;
    await supabase
      .from("solve_nodes")
      .update({ org_id: orgId, org_visibility: vis })
      .eq("id", node.id);
    await supabase
      .from("solve_nodes")
      .update({ org_id: orgId, org_visibility: vis })
      .eq("parent_id", node.id)
      .is("deleted_at", null);
    await writeAudit({
      action: "visibility_change",
      entity_type: "solve_node",
      entity_id: node.id,
      org_id: orgId,
      visibility_from: from,
      visibility_to: vis,
    });
    await load();
  }

  async function setOrgVisibility(vis: "private" | "org") {
    if (!node?.org_id) return;
    const from = node.org_visibility;
    await supabase
      .from("solve_nodes")
      .update({ org_visibility: vis })
      .eq("id", node.id);
    await supabase
      .from("solve_nodes")
      .update({ org_visibility: vis })
      .eq("parent_id", node.id)
      .is("deleted_at", null);
    await writeAudit({
      action: "visibility_change",
      entity_type: "solve_node",
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
      .from("share_links")
      .update({ revoked_at: now })
      .eq("node_id", node.id)
      .is("revoked_at", null);
    await supabase
      .from("share_grants")
      .update({ revoked_at: now })
      .eq("node_id", node.id)
      .is("revoked_at", null);
    await writeAudit({
      action: "share_revoke",
      entity_type: "solve_node",
      entity_id: node.id,
      org_id: node.org_id,
    });
    shareUrl = "";
    hasActiveShare = false;
  }

  async function softDelete() {
    if (!node) return;
    await softDeleteSolveNode({ id: node.id, org_id: node.org_id });
    await goto("/app/trash");
  }

  async function toggleFavorite() {
    if (!node) return;
    await supabase
      .from("solve_nodes")
      .update({ is_favorite: !node.is_favorite })
      .eq("id", node.id);
    await load();
  }

  async function createShareLink() {
    if (!node) return;
    shareMsg = "";
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (showOrgs && node.org_id) {
      shareMsg = t("shareOrgWarning");
    }
    const tok = token();
    const { error: e } = await supabase.from("share_links").insert({
      node_id: node.id,
      token: tok,
      created_by: user.id,
    });
    if (e) {
      shareMsg = e.message;
      return;
    }
    await writeAudit({
      action: "share_create",
      entity_type: "solve_node",
      entity_id: node.id,
      org_id: node.org_id,
    });
    shareUrl = `${location.origin}/share/${tok}`;
    hasActiveShare = true;
  }

  async function revokeShare() {
    if (!node) return;
    await revokeAllShares();
    shareMsg = t("shareRevoked");
  }

  async function cancelSharing() {
    if (!node) return;
    session.busy = true;
    shareMsg = "";
    error = "";
    try {
      if (node.org_id) {
        await revokeAllShares();
        shareMsg = t("shareRevoked");
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        error = t("noSession");
        return;
      }
      const { data: root, error: e1 } = await supabase
        .from("solve_nodes")
        .insert({
          owner_id: user.id,
          title: node.title,
          kind: "root",
          model: node.model,
          result: node.result,
          solver_meta: node.solver_meta ?? null,
          active_what_if_generation: activeWhatIfGeneration != null ? 1 : null,
          org_id: null,
          org_visibility: null,
        })
        .select("id")
        .single();
      if (e1 || !root) {
        error = e1?.message ?? "fork failed";
        return;
      }
      const copyGen = activeWhatIfGeneration ?? generations.at(-1) ?? null;
      const activeKids = whatIfChildren.filter(
        (c) => c.what_if_generation === copyGen && !c.deleted_at,
      );
      const activeBase =
        copyGen != null
          ? children.find(
              (c) =>
                isWhatIfBase(c) &&
                c.what_if_generation === copyGen &&
                !c.deleted_at,
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
        await supabase.from("solve_nodes").insert(forkKids);
      }
      await revokeAllShares();
      const now = new Date().toISOString();
      await supabase
        .from("solve_nodes")
        .update({ deleted_at: now })
        .eq("id", node.id);
      await writeAudit({
        action: "soft_delete",
        entity_type: "solve_node",
        entity_id: node.id,
        org_id: node.org_id,
      });
      await writeAudit({
        action: "fork",
        entity_type: "solve_node",
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
    const id = node.id;
    const { data: links } = await supabase
      .from("share_links")
      .select("token")
      .eq("node_id", id)
      .is("revoked_at", null);
    const { data: grants } = await supabase
      .from("share_grants")
      .select("id")
      .eq("node_id", id)
      .is("revoked_at", null);
    hasActiveShare = Boolean(links?.length || grants?.length);
    shareUrl = links?.[0] ? `${location.origin}/share/${links[0].token}` : "";
  }

  async function grantToEmail() {
    if (!node || !grantEmail.trim()) return;
    shareMsg = "";
    const identifier = grantEmail.trim();
    if (classifyShareIdentifier(identifier) === "invalid") {
      toast.error(t("grantInvalidIdentifier"));
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (isSelfShareIdentifier(identifier, { id: user.id, email: user.email })) {
      toast.error(t("grantSelfForbidden"));
      return;
    }
    const { error: e } = await supabase.rpc("share_grant_by_identifier", {
      p_node_id: node.id,
      p_identifier: identifier,
    });
    if (e) {
      const msg = e.message ?? "";
      if (msg.includes("invalid_identifier")) {
        toast.error(t("grantInvalidIdentifier"));
        return;
      }
      if (msg.includes("self_grant")) {
        toast.error(t("grantSelfForbidden"));
        return;
      }
      shareMsg = msg || t("grantHint");
      return;
    }
    grantEmail = "";
    await refreshShareState();
    toast.success(t("shareGranted"));
  }

  async function forkNode() {
    if (!node) return;
    session.busy = true;
    error = "";
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: root, error: e1 } = await supabase
        .from("solve_nodes")
        .insert({
          owner_id: user.id,
          title: `${node.title} (fork)`,
          kind: "root",
          model: node.model,
          result: node.result,
          solver_meta: node.solver_meta ?? null,
          active_what_if_generation: activeWhatIfGeneration != null ? 1 : null,
          org_id: null,
          org_visibility: null,
        })
        .select("id")
        .single();
      if (e1 || !root) {
        error = e1?.message ?? "fork failed";
        return;
      }
      const copyGen = activeWhatIfGeneration ?? generations.at(-1) ?? null;
      const activeKids = whatIfChildren.filter(
        (c) => c.what_if_generation === copyGen && !c.deleted_at,
      );
      const activeBase =
        copyGen != null
          ? children.find(
              (c) =>
                isWhatIfBase(c) &&
                c.what_if_generation === copyGen &&
                !c.deleted_at,
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
        await supabase.from("solve_nodes").insert(forkKids);
      }
      await writeAudit({
        action: "fork",
        entity_type: "solve_node",
        entity_id: root.id,
      });
      await goto(`/app/task/${root.id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      session.busy = false;
    }
  }

  /** Append one interactive scenario into the active what-if generation (or create gen 1). */
  async function appendSensitivityChild(
    payload: InteractiveScenarioPayload,
  ): Promise<void> {
    if (!node || whatIfBadge === "past") return;
    const { row, result, solver_meta } = payload;
    if (
      hasMutation(
        visibleChildren.map((c) => c.mutation),
        row.mutation,
      )
    ) {
      error = t("whatIfDuplicateHint");
      return;
    }
    session.busy = true;
    error = "";
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        error = t("noSession");
        return;
      }

      if (activeWhatIfGeneration == null) {
        const nextGen = nextGenerationNumber(generations);
        const baseModel = interactiveBaseModel ?? node.model;
        const baseResult = interactiveBaseResult ?? node.result;
        const baseMeta =
          session.lastResponse?.solver_meta ?? node.solver_meta ?? null;
        const baseRow = {
          owner_id: user.id,
          parent_id: node.id,
          org_id: node.org_id,
          org_visibility: node.org_visibility,
          kind: KIND_WHAT_IF_BASE,
          title: t("whatIf"),
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
        const { error: insErr } = await supabase
          .from("solve_nodes")
          .insert([baseRow, sensRow]);
        if (insErr) {
          error = insErr.message;
          return;
        }
        if (!(await setActiveWhatIfGeneration(nextGen))) return;
      } else {
        const gen = activeWhatIfGeneration;
        const { error: insErr } = await supabase.from("solve_nodes").insert({
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
    error = "";
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        error = t("noSession");
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
      const { data: root, error: e1 } = await supabase
        .from("solve_nodes")
        .insert({
          owner_id: user.id,
          title,
          kind: "root",
          model: row.mutatedModel,
          result: child?.result ?? {
            x: row.plan,
            Z: row.Z,
            resource_usage: {},
            resource_slack: {},
            shadow_prices: {},
            critical_resources: row.criticalResources,
            non_critical_resources: [],
            feasible: true,
          },
          solver_meta: child?.solver_meta ?? node.solver_meta ?? null,
          org_id: null,
          org_visibility: null,
        })
        .select("id")
        .single();
      if (e1 || !root) {
        error = e1?.message ?? "create failed";
        return;
      }
      await writeAudit({
        action: "fork",
        entity_type: "solve_node",
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
    const nextActive = resolveActiveAfterModelEdit(
      activeWhatIfGeneration,
      baseModel,
      next,
    );
    if (nextActive === activeWhatIfGeneration) return;
    void (async () => {
      if (!(await setActiveWhatIfGeneration(nextActive))) return;
      genIndex = defaultPagerIndex(buildPagerSlots(generations, nextActive));
    })();
  }

  /** Rename allowed even after solve (title-only update). */
  async function renameNode(nextTitle: string) {
    if (!node) return;
    const title = nextTitle.trim();
    if (!title || title === node.title) return;
    const { error: upErr } = await supabase
      .from("solve_nodes")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", node.id);
    if (upErr) {
      error = upErr.message || t("titleSaveFailed");
      return;
    }
    node = { ...node, title };
  }
</script>

{#if !node}
  <p class="text-text-muted">{error || "…"}</p>
{:else}
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-6">
    <PageHeader title={node.title} editable ontitlecommit={renameNode}>
      {#snippet actions()}
        {@const favoriteLabel = node!.is_favorite
          ? t("unfavorite")
          : t("favorite")}
        <Button
          variant="secondary"
          class="!px-2.5 !py-2.5"
          disabled={session.busy}
          aria-label={favoriteLabel}
          title={favoriteLabel}
          onclick={toggleFavorite}
        >
          <Star
            size={18}
            strokeWidth={1.75}
            aria-hidden="true"
            class={node!.is_favorite ? "text-amber-400" : "text-text-soft"}
            fill={node!.is_favorite ? "currentColor" : "none"}
          />
        </Button>
        <Button
          variant="secondary"
          class="!px-2.5 !py-2.5"
          disabled={session.busy}
          aria-label={t("fork")}
          title={t("fork")}
          onclick={forkNode}
        >
          <GitFork size={18} strokeWidth={1.75} aria-hidden="true" />
        </Button>
        <Button
          variant="danger"
          class="!px-2.5 !py-2.5"
          disabled={session.busy}
          aria-label={t("trashToBin")}
          title={t("trashToBin")}
          onclick={softDelete}
        >
          <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      {/snippet}
    </PageHeader>

    {#if error}
      <InlineAlert>{error}</InlineAlert>
    {/if}

    {#if session.model}
      <SolveWorkspace
        {session}
        title={node.title}
        {solverLibrary}
        showCloudSplit
        whatIfRows={showWhatIfChrome ? whatIfRows : []}
        whatIfGenerationIndex={genIndex}
        whatIfGenerationCount={showWhatIfChrome ? pagerSlots.length : 0}
        whatIfCurrentGenerationIndex={showWhatIfChrome
          ? currentPagerIndex
          : null}
        onWhatIfGenerationChange={(i) => (genIndex = i)}
        whatIfActiveHint={activeSlot?.badge === "current" &&
        activeSlot.kind === "generation"
          ? t("generationActiveHint")
          : undefined}
        {whatIfArchiveHint}
        whatIfBadge={showWhatIfChrome ? whatIfBadge : null}
        whatIfEmptyMessage={showWhatIfChrome ? whatIfEmptyMessage : null}
        whatIfBaseModel={showWhatIfChrome
          ? (generationBase?.model ?? null)
          : null}
        whatIfShowRestore={showWhatIfChrome && whatIfShowRestore}
        onWhatIfRestore={() => void restoreWhatIfBase()}
        onCreateTaskFromScenario={(row) => void createTaskFromScenario(row)}
        {interactiveBaseModel}
        {interactiveBaseResult}
        interactiveMethod={session.solveMethod}
        interactiveTransport={taskTransport}
        {interactiveTransportOpts}
        {interactiveExistingMutations}
        interactiveBusy={session.busy}
        onAddInteractiveToTable={(payload) =>
          void appendSensitivityChild(payload)}
        {onModelChange}
        onWhatIfChange={updateWhatIf}
        onSolve={() => void doSolve(false)}
        onSolveCloud={() => void doSolve(true)}
      >
        {#snippet planExtras()}
          <NodeComments nodeId={node!.id} scope="plan" />
        {/snippet}
        {#snippet resultExtras()}
          <NodeComments nodeId={node!.id} scope="result" />
        {/snippet}
      </SolveWorkspace>
    {:else}
      <Card>
        <p class="text-sm text-text-muted">{t("modelMatrix")}</p>
        <p class="mt-2 text-sm text-danger-text">{t("notFound")}</p>
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

    <SharePanel
      {shareUrl}
      {hasActiveShare}
      busy={session.busy}
      bind:grantValue={grantEmail}
      message={shareMsg}
      showOrgWarning={showOrgs && Boolean(node.org_id)}
      onCreateLink={createShareLink}
      onRevokeLink={revokeShare}
      onCancelSharing={cancelSharing}
      onGrant={grantToEmail}
    />
  </section>
{/if}
