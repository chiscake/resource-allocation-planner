import type { GaRunConfig } from "../../types.ts";
import type { GaHyperparameters } from "./native.ts";

export type GaPresetId = "fast" | "balanced" | "precise" | "custom";

export const GA_TRACE_MAX_INDIVIDUALS = 12_000;
export const GA_TRACE_MAX_POP_PER_GEN = 200;

/** Stable default seed for reproducible GA runs. */
export const GA_DEFAULT_SEED = 13;

export const GA_PRESET_DEFS: Record<
  Exclude<GaPresetId, "custom">,
  Partial<GaHyperparameters> & { labelKey: string }
> = {
  fast: {
    labelKey: "gaPresetFast",
    populationSize: 30,
    maxGenerations: 40,
    stagnationGenerations: 12,
    mutationProbability: 0.3,
    mutationSigma: 0.2,
    seed: GA_DEFAULT_SEED,
  },
  balanced: {
    labelKey: "gaPresetBalanced",
    populationSize: 60,
    maxGenerations: 120,
    stagnationGenerations: 25,
    mutationProbability: 0.25,
    mutationSigma: 0.15,
    seed: GA_DEFAULT_SEED,
  },
  precise: {
    labelKey: "gaPresetPrecise",
    populationSize: 100,
    maxGenerations: 250,
    stagnationGenerations: 40,
    mutationProbability: 0.2,
    mutationSigma: 0.1,
    eliteFraction: 0.12,
    seed: GA_DEFAULT_SEED,
  },
};

export function hyperToRunConfig(
  hyper: GaHyperparameters,
  preset: GaPresetId = "custom",
): GaRunConfig {
  return {
    populationSize: hyper.populationSize,
    crossoverProbability: hyper.crossoverProbability,
    mutationProbability: hyper.mutationProbability,
    mutationSigma: hyper.mutationSigma,
    selectionMethod: hyper.selectionMethod,
    tournamentProbability: hyper.tournamentProbability,
    tournamentSize: hyper.tournamentSize,
    eliteFraction: hyper.eliteFraction,
    crossoverType: hyper.crossoverType,
    uniformBias: hyper.uniformBias,
    penaltyM: hyper.penaltyM,
    seed: hyper.seed,
    initInFeasibleRegion: hyper.initInFeasibleRegion,
    maxGenerations: hyper.maxGenerations,
    stagnationGenerations: hyper.stagnationGenerations,
    useStagnation: hyper.useStagnation,
    preset,
  };
}

export function runConfigToHyper(
  config: Partial<GaRunConfig> | undefined,
): Partial<GaHyperparameters> {
  if (!config) return {};
  const {
    populationSize,
    crossoverProbability,
    mutationProbability,
    mutationSigma,
    selectionMethod,
    tournamentProbability,
    tournamentSize,
    eliteFraction,
    crossoverType,
    uniformBias,
    penaltyM,
    seed,
    initInFeasibleRegion,
    maxGenerations,
    stagnationGenerations,
    useStagnation,
  } = config;
  return {
    ...(populationSize != null ? { populationSize } : {}),
    ...(crossoverProbability != null ? { crossoverProbability } : {}),
    ...(mutationProbability != null ? { mutationProbability } : {}),
    ...(mutationSigma != null ? { mutationSigma } : {}),
    ...(selectionMethod != null ? { selectionMethod } : {}),
    ...(tournamentProbability != null ? { tournamentProbability } : {}),
    ...(tournamentSize != null ? { tournamentSize } : {}),
    ...(eliteFraction != null ? { eliteFraction } : {}),
    ...(crossoverType != null ? { crossoverType } : {}),
    ...(uniformBias != null ? { uniformBias } : {}),
    ...(penaltyM != null ? { penaltyM } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(initInFeasibleRegion != null ? { initInFeasibleRegion } : {}),
    ...(maxGenerations != null ? { maxGenerations } : {}),
    ...(stagnationGenerations != null ? { stagnationGenerations } : {}),
    ...(useStagnation != null ? { useStagnation } : {}),
  };
}

export function resolveGaHyper(
  preset: GaPresetId | undefined,
  overrides: Partial<GaHyperparameters> = {},
  baseDefaults: GaHyperparameters,
): GaHyperparameters {
  const fromPreset =
    preset && preset !== "custom" ? GA_PRESET_DEFS[preset] : {};
  const { labelKey: _l, ...presetParams } = fromPreset as typeof fromPreset & {
    labelKey?: string;
  };
  return { ...baseDefaults, ...presetParams, ...overrides };
}

export function resolveGaFromRunConfig(
  config: Partial<GaRunConfig> | undefined,
  baseDefaults: GaHyperparameters,
): { hyper: GaHyperparameters; preset: GaPresetId } {
  const preset = (config?.preset ?? 'balanced') as GaPresetId;
  const hyper = resolveGaHyper(
    preset,
    runConfigToHyper(config),
    baseDefaults,
  );
  return { hyper, preset };
}
