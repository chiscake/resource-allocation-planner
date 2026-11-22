import type { DlnRunConfig, GaRunConfig, SolveRunOptions } from './types.ts';

function isGaPreset(v: unknown): v is GaRunConfig['preset'] {
  return v === 'fast' || v === 'balanced' || v === 'precise' || v === 'custom';
}

function isDlnPreset(v: unknown): v is DlnRunConfig['preset'] {
  return v === 'fast' || v === 'precise' || v === 'custom';
}

function isSelectionMethod(v: unknown): v is GaRunConfig['selectionMethod'] {
  return v === 'roulette' || v === 'rank' || v === 'tournament' || v === 'elitism';
}

function isCrossoverType(v: unknown): v is GaRunConfig['crossoverType'] {
  return v === 'uniform' || v === 'one-point';
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/** Parse client `options` from Edge POST body (ignore unknown keys). */
export function parseSolveRunOptions(raw: unknown): SolveRunOptions | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: SolveRunOptions = {};

  const gaRaw = (raw as { ga?: unknown }).ga;
  if (gaRaw && typeof gaRaw === 'object') {
    const src = gaRaw as Record<string, unknown>;
    const ga: Partial<GaRunConfig> = {};

    const preset = src.preset;
    if (isGaPreset(preset)) ga.preset = preset;

    const seed = src.seed;
    if (seed === null) ga.seed = null;
    else {
      const n = num(seed);
      if (n != null) ga.seed = Math.trunc(n);
    }

    const populationSize = num(src.populationSize);
    if (populationSize != null) ga.populationSize = populationSize;
    const crossoverProbability = num(src.crossoverProbability);
    if (crossoverProbability != null) ga.crossoverProbability = crossoverProbability;
    const mutationProbability = num(src.mutationProbability);
    if (mutationProbability != null) ga.mutationProbability = mutationProbability;
    const mutationSigma = num(src.mutationSigma);
    if (mutationSigma != null) ga.mutationSigma = mutationSigma;
    if (isSelectionMethod(src.selectionMethod)) ga.selectionMethod = src.selectionMethod;
    const tournamentProbability = num(src.tournamentProbability);
    if (tournamentProbability != null) ga.tournamentProbability = tournamentProbability;
    const tournamentSize = num(src.tournamentSize);
    if (tournamentSize != null) ga.tournamentSize = Math.trunc(tournamentSize);
    const eliteFraction = num(src.eliteFraction);
    if (eliteFraction != null) ga.eliteFraction = eliteFraction;
    if (isCrossoverType(src.crossoverType)) ga.crossoverType = src.crossoverType;
    const uniformBias = num(src.uniformBias);
    if (uniformBias != null) ga.uniformBias = uniformBias;
    const penaltyM = num(src.penaltyM);
    if (penaltyM != null) ga.penaltyM = penaltyM;
    const initInFeasibleRegion = bool(src.initInFeasibleRegion);
    if (initInFeasibleRegion != null) ga.initInFeasibleRegion = initInFeasibleRegion;
    const maxGenerations = num(src.maxGenerations);
    if (maxGenerations != null) ga.maxGenerations = Math.trunc(maxGenerations);
    const stagnationGenerations = num(src.stagnationGenerations);
    if (stagnationGenerations != null) ga.stagnationGenerations = Math.trunc(stagnationGenerations);
    const useStagnation = bool(src.useStagnation);
    if (useStagnation != null) ga.useStagnation = useStagnation;

    if (Object.keys(ga).length) out.ga = ga;
  }

  const dlnRaw = (raw as { dln?: unknown }).dln;
  if (dlnRaw && typeof dlnRaw === 'object') {
    const src = dlnRaw as Record<string, unknown>;
    const dln: Partial<DlnRunConfig> = {};

    if (isDlnPreset(src.preset)) dln.preset = src.preset;
    const lambda = num(src.lambda);
    if (lambda != null) dln.lambda = lambda;
    const kappa = num(src.kappa);
    if (kappa != null) dln.kappa = kappa;
    const tol = num(src.tol);
    if (tol != null) dln.tol = tol;
    const rowScale = bool(src.rowScale);
    if (rowScale != null) dln.rowScale = rowScale;
    const maxIter = num(src.maxIter);
    if (maxIter != null) dln.maxIter = Math.trunc(maxIter);

    if (Object.keys(dln).length) out.dln = dln;
  }

  return Object.keys(out).length ? out : undefined;
}
