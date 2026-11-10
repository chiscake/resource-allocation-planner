/** Current model document version — do not bump while AGENTS schema_version rule exists. */
export const SCHEMA_VERSION = 1 as const;

export type SolveStatus = "done" | "rejected_too_large" | "accepted";

export type VenuePreference = "auto" | "cloud" | "local";
export type ResolvedVenue = "cloud" | "local";

/** Solve algorithm family (UI tabs). */
export type SolveMethod = "lp" | "ipm" | "ga" | "dln";

/** How the method is implemented: hand-rolled vs third-party library. */
export type SolveEngine = "native" | "library";

export const SOLVE_METHODS: SolveMethod[] = ["lp", "ipm", "ga", "dln"];
export const SOLVE_ENGINES: SolveEngine[] = ["native", "library"];

export function isSolveMethod(v: unknown): v is SolveMethod {
  return v === "lp" || v === "ipm" || v === "ga" || v === "dln";
}

export function isSolveEngine(v: unknown): v is SolveEngine {
  return v === "native" || v === "library";
}

/** Package id before `@venue` in solver_meta.library. */
export function libraryPackageId(
  method: SolveMethod,
  engine: SolveEngine,
): string {
  if (method === "lp") {
    return engine === "library" ? "javascript-lp-solver" : "simplex-native";
  }
  if (method === "ipm") {
    return engine === "library" ? "interior-point-lib" : "interior-point";
  }
  if (method === "dln") {
    return engine === "library" ? "dln-diagonal-lib" : "dln-diagonal";
  }
  return engine === "library" ? "ga-evolutionary-lib" : "ga-evolutionary";
}

/** library string identifies package + venue, e.g. `interior-point@local`. */
export function libraryFor(
  method: SolveMethod,
  venue: ResolvedVenue,
  engine: SolveEngine,
): string {
  return `${libraryPackageId(method, engine)}@${venue}`;
}

export interface Model {
  schema_version: typeof SCHEMA_VERSION;
  resources: string[];
  products: string[];
  /** rows = resources, cols = products */
  A: number[][];
  b: number[];
  c: number[];
  resource_units?: string[];
  product_units?: string[];
  /** Unit of the objective / profit (e.g. «у.е.»). Display-only. */
  objective_unit?: string;
  what_if_defaults?: WhatIfDefaults;
}

export interface WhatIfDefaults {
  /** Relative pct (0.1 = 10%). `null` = user cleared → skip that mutation family. */
  resource_pct?: number | null;
  modernization_pct?: number | null;
  price_pct?: number | null;
}

export type MutationKind = "resource_change" | "modernization" | "price_change";

export interface Mutation {
  kind: MutationKind;
  /** Resource or product name */
  target: string;
  /** Relative change, e.g. 0.1 = +10%, -0.1 = -10% */
  delta: number;
  label?: string;
}

export interface SolveResult {
  x: Record<string, number>;
  Z: number;
  resource_usage: Record<string, number>;
  resource_slack: Record<string, number>;
  shadow_prices: Record<string, number>;
  critical_resources: string[];
  non_critical_resources: string[];
  feasible: boolean;
}

/** Persisted run config for reproducible local trace regeneration (not the full trace). */
export type GaRunConfig = {
  populationSize: number;
  crossoverProbability: number;
  mutationProbability: number;
  mutationSigma: number;
  selectionMethod: "roulette" | "rank" | "tournament" | "elitism";
  tournamentProbability: number;
  tournamentSize: number;
  eliteFraction: number;
  crossoverType: "uniform" | "one-point";
  uniformBias: number;
  penaltyM: number;
  /** null = random seed at run time (stored as the concrete seed that was used). */
  seed: number | null;
  initInFeasibleRegion: boolean;
  maxGenerations: number;
  stagnationGenerations: number;
  useStagnation: boolean;
  /** UI preset id when launched from a preset. */
  preset?: "fast" | "balanced" | "precise" | "custom";
};

export type GaStopReason = "maxGenerations" | "stagnation";

export type DlnRunConfig = {
  lambda: number;
  kappa: number;
  tol: number;
  rowScale: boolean;
  maxIter: number;
  preset?: "fast" | "precise" | "custom";
};

export type DlnStopReason = "tol" | "max_iter";

export type SolveRunProvenance =
  | { method: "lp"; engine: SolveEngine }
  | { method: "ipm"; engine: SolveEngine }
  | {
      method: "ga";
      engine: SolveEngine;
      config: GaRunConfig;
      stopReason?: GaStopReason;
      generationsRun?: number;
      /** True when population was subsampled for the in-memory trace. */
      populationSampled?: boolean;
    }
  | {
      method: "dln";
      engine: SolveEngine;
      config: DlnRunConfig;
      stopReason?: DlnStopReason;
      iterations: number;
      residual: number;
    };

export interface SolverMeta {
  venue: ResolvedVenue;
  /** Package + venue, e.g. `javascript-lp-solver@local`, `simplex-native@cloud`. */
  library: string;
  duration_ms: number;
  rejected_reason?: string;
  hint?: string;
  /** Present when plan x was post-rounded for display; duals remain from continuous LP. */
  rounding?: "nearest";
  /** Explicit method id. */
  method?: SolveMethod;
  /** native = hand-rolled (viz); library = third-party (verify / default calc). */
  engine?: SolveEngine;
  /** GA-only: optimality gap vs LP Z when LP reference available. */
  gap_vs_lp?: number;
  /** Run config / stop metadata for reproducible «Подробнее» regeneration. */
  provenance?: SolveRunProvenance;
}

/** Flexible per-method viz payload (in-memory only; not persisted). */
export type SimplexTraceFrame = {
  /** Full tableau rows (constraints + objective); last column is RHS. */
  matrix?: number[][];
  reducedCosts?: number[];
  basis?: string[];
  note?: string;
  phase?: 1 | 2;
  Z?: number;
  colLabels?: string[];
  rowLabels?: string[];
  entering?: string;
  leaving?: string;
  problem?: "primal" | "dual";
  /** Primal solution vector at this frame (product order). */
  x?: number[];
};

export type GaIndividualSnapshot = {
  genes: number[];
  rawFitness: number;
  fitness: number;
  penalty: number;
  feasible: boolean;
};

export type GaGenerationSnapshot = {
  generation: number;
  population: GaIndividualSnapshot[];
  bestIndex: number;
  bestEver: GaIndividualSnapshot;
  bestFitness: number;
  meanFitness: number;
  worstFitness: number;
  feasibleCount: number;
};

export type GaTraceMeta = {
  stopReason: GaStopReason;
  generationsRun: number;
  populationSampled: boolean;
  config: GaRunConfig;
};

export type IpmTraceFrame = {
  iteration: number;
  dualityGap?: number;
  note?: string;
  x?: number[];
};

export type SolveTrace =
  | {
      method: "lp";
      /** Primal simplex frames. */
      frames: SimplexTraceFrame[];
      /** Dual simplex frames (shadow-price solve). */
      dual_frames?: SimplexTraceFrame[];
    }
  | {
      method: "ga";
      generations: GaGenerationSnapshot[];
      meta?: GaTraceMeta;
    }
  | { method: "ipm"; frames: IpmTraceFrame[] };

/** Optional run options passed into engines (GA/DLN hyperparameters). */
export type SolveRunOptions = {
  ga?: Partial<GaRunConfig>;
  dln?: Partial<DlnRunConfig>;
};

export interface SolveRequest {
  model: Model;
  method?: SolveMethod;
  /** Omit → registry default (library if registered, else native). */
  engine?: SolveEngine;
  options?: SolveRunOptions;
}

export interface SolveResponse {
  status: SolveStatus;
  result?: SolveResult;
  solver_meta: SolverMeta;
  /** Present for native viz / streaming consumers; never written to DB. */
  trace?: SolveTrace;
}

export interface MutationRunItem {
  mutation: Mutation;
  model: Model;
  response: SolveResponse;
}

export interface RunMutationsResponse {
  status: SolveStatus;
  items: MutationRunItem[];
  solver_meta: SolverMeta;
}
