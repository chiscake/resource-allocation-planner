/** Shared types for Edge solver mirror (no $lib). */
export type SolveMethod = 'lp' | 'ipm' | 'ga' | 'dln';
export type SolveEngine = 'native' | 'library';
export type ResolvedVenue = 'cloud' | 'local';

export interface Model {
  schema_version: number;
  resources: string[];
  products: string[];
  A: number[][];
  b: number[];
  c: number[];
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

export type SimplexTraceFrame = {
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
  problem?: 'primal' | 'dual';
  x?: number[];
};

export type GaRunConfig = {
  populationSize: number;
  crossoverProbability: number;
  mutationProbability: number;
  mutationSigma: number;
  selectionMethod: 'roulette' | 'rank' | 'tournament' | 'elitism';
  tournamentProbability: number;
  tournamentSize: number;
  eliteFraction: number;
  crossoverType: 'uniform' | 'one-point';
  uniformBias: number;
  penaltyM: number;
  seed: number | null;
  initInFeasibleRegion: boolean;
  maxGenerations: number;
  stagnationGenerations: number;
  useStagnation: boolean;
  preset?: 'fast' | 'balanced' | 'precise' | 'custom';
};

export type GaStopReason = 'maxGenerations' | 'stagnation';

export type DlnRunConfig = {
  lambda: number;
  kappa: number;
  tol: number;
  rowScale: boolean;
  maxIter: number;
  preset?: 'fast' | 'precise' | 'custom';
};

export type DlnStopReason = 'tol' | 'max_iter';

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

export type SolveRunProvenance =
  | { method: 'lp'; engine: SolveEngine }
  | { method: 'ipm'; engine: SolveEngine }
  | {
      method: 'ga';
      engine: SolveEngine;
      config: GaRunConfig;
      stopReason?: GaStopReason;
      generationsRun?: number;
      populationSampled?: boolean;
    }
  | {
      method: 'dln';
      engine: SolveEngine;
      config: DlnRunConfig;
      stopReason?: DlnStopReason;
      iterations: number;
      residual: number;
    };

export type SolveRunOptions = {
  ga?: Partial<GaRunConfig>;
  dln?: Partial<DlnRunConfig>;
};

export type SolveTrace =
  | { method: 'lp'; frames: SimplexTraceFrame[]; dual_frames?: SimplexTraceFrame[] }
  | { method: 'ga'; generations: GaGenerationSnapshot[]; meta?: GaTraceMeta }
  | { method: 'ipm'; frames: unknown[] };

export function libraryPackageId(method: SolveMethod, engine: SolveEngine): string {
  if (method === 'lp') {
    return engine === 'library' ? 'javascript-lp-solver' : 'simplex-native';
  }
  if (method === 'ipm') {
    return engine === 'library' ? 'interior-point-lib' : 'interior-point';
  }
  if (method === 'dln') {
    return engine === 'library' ? 'dln-diagonal-lib' : 'dln-diagonal';
  }
  return engine === 'library' ? 'ga-evolutionary-lib' : 'ga-evolutionary';
}

export function libraryFor(method: SolveMethod, venue: ResolvedVenue, engine: SolveEngine): string {
  return `${libraryPackageId(method, engine)}@${venue}`;
}

export const SCHEMA_VERSION = 1;
export const LIMITS = {
  maxVariables: 200,
  maxConstraints: 200,
  maxDenseCells: 20_000,
  singleSolveMs: 5000,
  mutationMaxK: 64,
};
