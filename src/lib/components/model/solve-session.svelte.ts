import {
  buildDefaultMutations,
  buildWhatIfRowData,
  cloneModel,
  type DlnRunConfig,
  type GaRunConfig,
  type Model,
  type Mutation,
  type RunMutationsResponse,
  type SolveMethod,
  type SolveResponse,
  type SolveResult,
  type SolveRunOptions,
  type SolveTrace,
  type WhatIfDefaults,
  type WhatIfRowData,
} from "$lib/domain";
import { getRoundPlanPreference, maybeRoundPlan } from "$lib/display";
import { modelSourceKey } from "$lib/components/model/lp-tableau";
import { resolveSolveMode } from "$lib/solver/mode";
import { verifyAgainstLibrary, type VerifyReport } from "$lib/solver/verify";
import {
  GA_DEFAULT_SEED,
  type GaPresetId,
} from "$lib/solver/methods/ga/presets";
import {
  DLN_PRESET_DEFS,
  type DlnPresetId,
} from "$lib/solver/methods/dln/presets";
import { t } from "$lib/i18n";

export type SolveTabId = "plan" | "ipm" | "ga" | "dln";

/** Sensitivity table row (Task 13 а/б/в fields). */
export type WhatIfRow = WhatIfRowData;

/** Empty/whitespace → null (omit family). Valid number → fraction. */
export function inputToPct(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n / 100 : null;
}

export function tabToSolveMethod(tab: string): SolveMethod {
  if (tab === "ipm") return "ipm";
  if (tab === "ga") return "ga";
  if (tab === "dln") return "dln";
  return "lp";
}

export function solveMethodToTab(method: SolveMethod): SolveTabId {
  if (method === "ipm") return "ipm";
  if (method === "ga") return "ga";
  if (method === "dln") return "dln";
  return "plan";
}

export function whatIfRowsFromMutations(
  pack: RunMutationsResponse,
  base: Model,
  baseResult?: SolveResult | null,
): WhatIfRow[] {
  return pack.items.map((item) =>
    buildWhatIfRowData({
      base,
      baseResult,
      mutation: item.mutation,
      mutatedModel: item.model,
      result: item.response.result ?? null,
    }),
  );
}

export type SolveTransportOpts = {
  engine?: import("$lib/domain").SolveEngine;
  cloud?: boolean;
  options?: import("$lib/domain").SolveRunOptions;
};

export type SolveTransport = {
  solve: (
    model: Model,
    method: SolveMethod,
    opts?: SolveTransportOpts,
  ) => Promise<SolveResponse>;
  runMutations: (
    model: Model,
    mutations: Mutation[],
    method: SolveMethod,
    opts?: SolveTransportOpts,
  ) => Promise<RunMutationsResponse>;
};

export type AfterSolveCtx = {
  model: Model;
  result: SolveResult | null;
  response: SolveResponse;
  method: SolveMethod;
  cloud: boolean;
};

export type SolveCycleResult = {
  model: Model;
  result: SolveResult | null;
  response: SolveResponse;
  whatIfItems: WhatIfRow[];
  mutationsResponse: RunMutationsResponse | null;
  method: SolveMethod;
  cloud: boolean;
  verifyReport: VerifyReport | null;
};

export type SolveSession = ReturnType<typeof createSolveSession>;

/**
 * Shared solve-editor session: tabs↔method, what-if %, round display, solve cycle.
 * Persist stays in the caller via afterSolve / post-cycle hooks.
 */
export function createSolveSession(init?: {
  activeTab?: string;
  includeSensitivity?: boolean;
  model?: Model | null;
  result?: SolveResult | null;
}) {
  let activeTab = $state(init?.activeTab ?? "plan");
  let includeSensitivity = $state(init?.includeSensitivity ?? false);
  let roundPlan = $state(false);
  let busy = $state(false);
  let error = $state("");
  let solveEpoch = $state(0);
  let model = $state<Model | null>(init?.model ?? null);
  let result = $state<SolveResult | null>(init?.result ?? null);
  let whatIfItems = $state<WhatIfRow[]>([]);
  let lastResponse = $state<SolveResponse | null>(null);
  let lastTrace = $state<SolveTrace | null>(null);
  let verifyReport = $state<VerifyReport | null>(null);
  let lastWasCloud = $state(false);
  let gaPreset = $state<GaPresetId>("balanced");
  let gaConfig = $state<Partial<GaRunConfig>>({ seed: GA_DEFAULT_SEED });
  let dlnPreset = $state<DlnPresetId>("precise");
  let dlnConfig = $state<Partial<DlnRunConfig>>({
    lambda: DLN_PRESET_DEFS.precise.lambda,
    kappa: DLN_PRESET_DEFS.precise.kappa,
    tol: DLN_PRESET_DEFS.precise.tol,
    rowScale: DLN_PRESET_DEFS.precise.rowScale,
    maxIter: DLN_PRESET_DEFS.precise.maxIter,
  });

  const solveMethod = $derived(tabToSolveMethod(activeTab));
  const methodReady = $derived(
    activeTab === "plan" ||
      activeTab === "ipm" ||
      activeTab === "ga" ||
      activeTab === "dln",
  );
  const displayResult = $derived(
    result && model ? maybeRoundPlan(model, result, roundPlan) : null,
  );
  const stepsAvailable = $derived(
    !lastWasCloud &&
      result != null &&
      (solveMethod === "lp" ||
        solveMethod === "ga" ||
        solveMethod === "ipm" ||
        solveMethod === "dln"),
  );

  function gaSeed(): number | null {
    return gaConfig.seed === undefined ? GA_DEFAULT_SEED : gaConfig.seed;
  }

  function buildRunOptions(method: SolveMethod): SolveRunOptions | undefined {
    if (method === "ga") {
      // Named presets: send only id + seed so leftover custom fields cannot override.
      if (gaPreset !== "custom") {
        return { ga: { preset: gaPreset, seed: gaSeed() } };
      }
      return {
        ga: {
          preset: "custom",
          seed: gaSeed(),
          ...gaConfig,
        },
      };
    }
    if (method === "dln") {
      if (dlnPreset !== "custom") {
        return { dln: { preset: dlnPreset } };
      }
      return {
        dln: {
          preset: "custom",
          ...dlnConfig,
        },
      };
    }
    return undefined;
  }

  function loadRoundPref() {
    roundPlan = getRoundPlanPreference();
  }

  function replaceModel(next: Model, opts?: { clearDerived?: boolean }) {
    const clear = opts?.clearDerived ?? true;
    const prevKey = model ? modelSourceKey(model) : "";
    const nextKey = modelSourceKey(next);
    model = next;
    if (clear && nextKey !== prevKey) {
      result = null;
      whatIfItems = [];
      lastResponse = null;
      lastTrace = null;
      verifyReport = null;
      lastWasCloud = false;
    }
  }

  function updateWhatIf(field: keyof WhatIfDefaults, raw: string) {
    if (!model) return;
    const next = cloneModel($state.snapshot(model));
    next.what_if_defaults = {
      ...(next.what_if_defaults ?? {}),
      [field]: inputToPct(raw),
    };
    model = next;
  }

  function hydrate(next: {
    model: Model;
    result?: SolveResult | null;
    activeTab?: string;
    includeSensitivity?: boolean;
    whatIfItems?: WhatIfRow[];
    lastResponse?: SolveResponse | null;
    verifyReport?: VerifyReport | null;
    lastWasCloud?: boolean;
  }) {
    model = cloneModel(next.model);
    result = next.result ?? null;
    if (next.activeTab != null) activeTab = next.activeTab;
    if (next.includeSensitivity != null)
      includeSensitivity = next.includeSensitivity;
    whatIfItems = next.whatIfItems ?? [];
    lastResponse = next.lastResponse ?? null;
    lastTrace = next.lastResponse?.trace ?? null;
    verifyReport = next.verifyReport ?? null;
    lastWasCloud = next.lastWasCloud ?? false;
  }

  function applyVerify(report: VerifyReport) {
    verifyReport = report;
    if (!report.anyMismatch) return;
    console.warn("[solver_mismatch] native vs library", report);
    if (typeof alert === "function") {
      alert(t("solverMismatchAlert"));
    }
  }

  /**
   * Primary solve + optional sensitivity pack.
   * `afterSolve`: return `false` to skip mutations (and treat as abort for caller).
   * `cloud`: one-shot Edge / library path (LP).
   */
  async function runSolveCycle(
    transport: SolveTransport,
    opts?: {
      afterSolve?: (ctx: AfterSolveCtx) => Promise<boolean | void>;
      cloud?: boolean;
      onVerify?: (report: VerifyReport) => void | Promise<void>;
    },
  ): Promise<SolveCycleResult | null> {
    if (!model || busy || !methodReady) return null;
    busy = true;
    error = "";
    try {
      const snapshot = $state.snapshot(model);
      const method = tabToSolveMethod(activeTab);
      const cloud = opts?.cloud === true;
      const mode = resolveSolveMode(method, cloud);
      const transportOpts: SolveTransportOpts = {
        engine: mode.engine,
        cloud,
        options: buildRunOptions(method),
      };

      const response = await transport.solve(snapshot, method, transportOpts);
      model = snapshot;
      result = response.result ?? null;
      lastResponse = response;
      lastTrace = response.trace ?? null;
      lastWasCloud = cloud;
      whatIfItems = [];
      verifyReport = null;
      solveEpoch += 1;

      const after = await opts?.afterSolve?.({
        model: snapshot,
        result: response.result ?? null,
        response,
        method,
        cloud,
      });
      if (after === false) {
        return {
          model: snapshot,
          result: response.result ?? null,
          response,
          whatIfItems: [],
          mutationsResponse: null,
          method,
          cloud,
          verifyReport: null,
        };
      }

      let mutationsResponse: RunMutationsResponse | null = null;
      if (response.status === "done" && includeSensitivity) {
        const mutations = buildDefaultMutations(snapshot);
        if (mutations.length > 0) {
          mutationsResponse = await transport.runMutations(
            snapshot,
            mutations,
            method,
            transportOpts,
          );
          if (mutationsResponse.status === "done") {
            whatIfItems = whatIfRowsFromMutations(
              mutationsResponse,
              snapshot,
              response.result ?? null,
            );
          } else {
            const r = mutationsResponse.solver_meta.rejected_reason;
            error =
              mutationsResponse.solver_meta.hint === "dln_unsupported" ||
              (r && r.startsWith("dln_unsupported"))
                ? t("dlnUnsupportedHint")
                : (r ?? mutationsResponse.status);
          }
        }
      } else if (response.status !== "done") {
        const r = response.solver_meta.rejected_reason;
        error =
          response.solver_meta.hint === "dln_unsupported" ||
          (r && r.startsWith("dln_unsupported"))
            ? t("dlnUnsupportedHint")
            : (r ?? response.status);
      }

      let report: VerifyReport | null = null;
      if (
        !cloud &&
        method === "lp" &&
        response.status === "done" &&
        response.solver_meta.engine === "native"
      ) {
        report = verifyAgainstLibrary(
          snapshot,
          response,
          method,
          mutationsResponse?.status === "done"
            ? mutationsResponse.items
            : undefined,
        );
        applyVerify(report);
        await opts?.onVerify?.(report);
      }

      return {
        model: snapshot,
        result: response.result ?? null,
        response,
        whatIfItems: [...whatIfItems],
        mutationsResponse,
        method,
        cloud,
        verifyReport: report,
      };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return null;
    } finally {
      busy = false;
    }
  }

  return {
    get activeTab() {
      return activeTab;
    },
    set activeTab(v: string) {
      activeTab = v;
    },
    get includeSensitivity() {
      return includeSensitivity;
    },
    set includeSensitivity(v: boolean) {
      includeSensitivity = v;
    },
    get roundPlan() {
      return roundPlan;
    },
    set roundPlan(v: boolean) {
      roundPlan = v;
    },
    get busy() {
      return busy;
    },
    set busy(v: boolean) {
      busy = v;
    },
    get error() {
      return error;
    },
    set error(v: string) {
      error = v;
    },
    get solveEpoch() {
      return solveEpoch;
    },
    get model() {
      return model;
    },
    set model(v: Model | null) {
      model = v;
    },
    get result() {
      return result;
    },
    set result(v: SolveResult | null) {
      result = v;
    },
    get whatIfItems() {
      return whatIfItems;
    },
    set whatIfItems(v: WhatIfRow[]) {
      whatIfItems = v;
    },
    get lastResponse() {
      return lastResponse;
    },
    get lastTrace() {
      return lastTrace;
    },
    set lastTrace(v: SolveTrace | null) {
      lastTrace = v;
    },
    get verifyReport() {
      return verifyReport;
    },
    set verifyReport(v: VerifyReport | null) {
      verifyReport = v;
    },
    get lastWasCloud() {
      return lastWasCloud;
    },
    set lastWasCloud(v: boolean) {
      lastWasCloud = v;
    },
    get gaPreset() {
      return gaPreset;
    },
    set gaPreset(v: GaPresetId) {
      gaPreset = v;
      if (v !== "custom") {
        gaConfig = { seed: gaSeed() };
      }
    },
    get gaConfig() {
      return gaConfig;
    },
    set gaConfig(v: Partial<GaRunConfig>) {
      gaConfig = v;
    },
    get dlnPreset() {
      return dlnPreset;
    },
    set dlnPreset(v: DlnPresetId) {
      dlnPreset = v;
      if (v !== "custom") {
        const def = DLN_PRESET_DEFS[v];
        dlnConfig = {
          lambda: def.lambda,
          kappa: def.kappa,
          tol: def.tol,
          rowScale: def.rowScale,
          maxIter: def.maxIter,
        };
      }
    },
    get dlnConfig() {
      return dlnConfig;
    },
    set dlnConfig(v: Partial<DlnRunConfig>) {
      dlnConfig = v;
    },
    get solveMethod() {
      return solveMethod;
    },
    get methodReady() {
      return methodReady;
    },
    get displayResult() {
      return displayResult;
    },
    get stepsAvailable() {
      return stepsAvailable;
    },
    buildRunOptions,
    loadRoundPref,
    replaceModel,
    updateWhatIf,
    hydrate,
    applyVerify,
    runSolveCycle,
  };
}
