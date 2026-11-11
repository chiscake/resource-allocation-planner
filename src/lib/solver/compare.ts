import {
  SOLVE_METHODS,
  type Model,
  type SolveEngine,
  type SolveMethod,
  type SolveResponse,
  type SolveResult,
  type SolveRunOptions,
  type SolveTrace,
} from "$lib/domain";
import { solveLocal } from "./run";
import { availableEngines } from "./registry";
import {
  DEFAULT_GA_HYPERPARAMS,
  type GaHyperparameters,
} from "./methods/ga/native";
import {
  hyperToRunConfig,
  resolveGaFromRunConfig,
  type GaPresetId,
} from "./methods/ga/presets";
import {
  DEFAULT_DLN_HYPERPARAMS,
  type DlnHyperparameters,
} from "./methods/dln/native";
import {
  dlnHyperToRunConfig,
  resolveDlnFromRunConfig,
  type DlnPresetId,
} from "./methods/dln/presets";

export type CompareConfigId = `${SolveMethod}:${SolveEngine}`;

export type CompareConfig = {
  id: CompareConfigId;
  method: SolveMethod;
  engine: SolveEngine;
  label: string;
  /** LP native is always included as baseline. */
  required?: boolean;
};

export type CompareRow = {
  config: CompareConfig;
  ok: boolean;
  error?: string;
  result?: SolveResult;
  response?: SolveResponse;
  trace?: SolveTrace;
  durationMs: number;
  deltaZ: number;
  gap: number;
  maxAbsDx: number;
};

export function listCompareConfigs(): CompareConfig[] {
  const out: CompareConfig[] = [];
  for (const method of SOLVE_METHODS) {
    for (const engine of availableEngines(method)) {
      const id = `${method}:${engine}` as CompareConfigId;
      out.push({
        id,
        method,
        engine,
        label: `${method} · ${engine}`,
        required: method === "lp" && engine === "native",
      });
    }
  }
  return out;
}

function planVector(model: Model, result: SolveResult): number[] {
  return model.products.map((p) => result.x[p] ?? 0);
}

function maxAbsDx(a: number[], b: number[]): number {
  let m = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    m = Math.max(m, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  }
  return m;
}

export function runMethodComparison(
  model: Model,
  selectedIds: CompareConfigId[],
  opts?: {
    gaHyper?: Partial<GaHyperparameters>;
    gaPreset?: GaPresetId;
    dlnHyper?: Partial<DlnHyperparameters>;
    dlnPreset?: DlnPresetId;
  },
): CompareRow[] {
  const all = listCompareConfigs();
  const selected = new Set(selectedIds);
  // Ensure LP native baseline
  selected.add("lp:native");

  const configs = all.filter((c) => selected.has(c.id));
  const gaPreset = opts?.gaPreset ?? "balanced";
  const { hyper } = resolveGaFromRunConfig(
    {
      preset: gaPreset,
      ...opts?.gaHyper,
    },
    DEFAULT_GA_HYPERPARAMS,
  );
  const gaOptions: SolveRunOptions = {
    ga: hyperToRunConfig(hyper, gaPreset),
  };

  const dlnPreset = opts?.dlnPreset ?? "precise";
  const { hyper: dlnHyper } = resolveDlnFromRunConfig(
    {
      preset: dlnPreset,
      ...opts?.dlnHyper,
    },
    DEFAULT_DLN_HYPERPARAMS,
  );
  const dlnOptions: SolveRunOptions = {
    dln: dlnHyperToRunConfig(dlnHyper, dlnPreset),
  };

  const rows: CompareRow[] = [];
  let baseline: SolveResult | null = null;

  // Run baseline first
  const ordered = [
    ...configs.filter((c) => c.id === "lp:native"),
    ...configs.filter((c) => c.id !== "lp:native"),
  ];

  for (const config of ordered) {
    const started = performance.now();
    try {
      const options =
        config.method === "ga"
          ? gaOptions
          : config.method === "dln"
            ? dlnOptions
            : undefined;
      const response = solveLocal(
        model,
        "local",
        0,
        config.method,
        config.engine,
        options,
      );
      const durationMs = performance.now() - started;
      if (response.status !== "done" || !response.result) {
        rows.push({
          config,
          ok: false,
          error: response.solver_meta.rejected_reason ?? response.status,
          durationMs,
          deltaZ: Number.NaN,
          gap: Number.NaN,
          maxAbsDx: Number.NaN,
          response,
        });
        continue;
      }
      if (config.id === "lp:native") baseline = response.result;
      const deltaZ = baseline ? response.result.Z - baseline.Z : 0;
      const gap =
        baseline && Math.abs(baseline.Z) > 1e-9
          ? Math.max(0, (baseline.Z - response.result.Z) / baseline.Z)
          : 0;
      const dx = baseline
        ? maxAbsDx(
            planVector(model, response.result),
            planVector(model, baseline),
          )
        : 0;
      rows.push({
        config,
        ok: true,
        result: response.result,
        response,
        trace: response.trace,
        durationMs,
        deltaZ,
        gap,
        maxAbsDx: dx,
      });
    } catch (e) {
      rows.push({
        config,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        durationMs: performance.now() - started,
        deltaZ: Number.NaN,
        gap: Number.NaN,
        maxAbsDx: Number.NaN,
      });
    }
  }
  return rows;
}
