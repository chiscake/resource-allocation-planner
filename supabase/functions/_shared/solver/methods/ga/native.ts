/**
 * Genetic / evolutionary solver for RAP Model — port of ОПР `runEvolutionaryAlgorithm`
 * operators (tournament/roulette/rank/elitism, uniform/one-point crossover, Gaussian-ish
 * mutation, penalty fitness) generalized from 2D {x1,x2} to n product genes.
 *
 * Source: store internal/evolutionary-source/evolutionary/evolutionary.ts
 * Adapter: Model {A,b,c} → chromosome bounds + fitness = cᵀx − M·violation(Ax≤b, x≥0).
 *
 * Acceptance (AGENTS): feasibility + gap vs LP — not equality to simplex.
 */
import type {
  GaGenerationSnapshot,
  GaIndividualSnapshot,
  GaRunConfig,
  GaStopReason,
  GaTraceMeta,
  Model,
  SolveResult,
  SolveTrace,
} from "../../types.ts";
import {
  buildSolveResult,
  usageViolation,
  variableBounds,
} from "../../shared/resultBuild.ts";
import { solveLocalLpDuals } from "../../shared/lpDuals.ts";
import {
  GA_TRACE_MAX_INDIVIDUALS,
  GA_TRACE_MAX_POP_PER_GEN,
  hyperToRunConfig,
  type GaPresetId,
} from "./presets.ts";

export type SelectionMethod = "roulette" | "rank" | "tournament" | "elitism";
export type CrossoverType = "uniform" | "one-point";

export interface GaHyperparameters {
  populationSize: number;
  crossoverProbability: number;
  mutationProbability: number;
  mutationSigma: number;
  selectionMethod: SelectionMethod;
  tournamentProbability: number;
  tournamentSize: number;
  eliteFraction: number;
  crossoverType: CrossoverType;
  uniformBias: number;
  penaltyM: number;
  seed: number | null;
  initInFeasibleRegion: boolean;
  maxGenerations: number;
  stagnationGenerations: number;
  useStagnation: boolean;
}

export const DEFAULT_GA_HYPERPARAMS: GaHyperparameters = {
  populationSize: 60,
  crossoverProbability: 0.85,
  mutationProbability: 0.25,
  mutationSigma: 0.15, // fraction of per-gene bound
  selectionMethod: "elitism",
  tournamentProbability: 0.8,
  tournamentSize: 3,
  eliteFraction: 0.1,
  crossoverType: "uniform",
  uniformBias: 0.5,
  penaltyM: 1e4,
  seed: 13,
  initInFeasibleRegion: true,
  maxGenerations: 120,
  stagnationGenerations: 25,
  useStagnation: true,
};

interface Individual {
  genes: number[];
  rawFitness: number;
  penalty: number;
  fitness: number;
  feasible: boolean;
}

interface GaContext {
  model: Model;
  bounds: number[];
  hyperparameters: GaHyperparameters;
  rng: () => number;
}

function createRng(seed: number | null): () => number {
  if (seed == null) return Math.random;
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clip(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function profit(model: Model, genes: number[]): number {
  let z = 0;
  for (let j = 0; j < model.products.length; j++) z += model.c[j] * genes[j];
  return z;
}

function buildIndividual(genes: number[], ctx: GaContext): Individual {
  const { model, hyperparameters } = ctx;
  const clipped = genes.map((g, j) => clip(g, 0, ctx.bounds[j]));
  const rawFitness = profit(model, clipped);
  const penalty = usageViolation(model, clipped);
  const feasible = penalty <= 1e-9;
  const fitness = rawFitness - hyperparameters.penaltyM * penalty;
  return { genes: clipped, rawFitness, penalty, fitness, feasible };
}

function randomGenes(ctx: GaContext): number[] {
  const { bounds, rng } = ctx;
  return bounds.map((ub) => rng() * ub);
}

function initPopulation(ctx: GaContext): Individual[] {
  const { hyperparameters, rng, model, bounds } = ctx;
  const size = hyperparameters.populationSize;
  const population: Individual[] = [];

  if (!hyperparameters.initInFeasibleRegion) {
    for (let i = 0; i < size; i++) population.push(buildIndividual(randomGenes(ctx), ctx));
    return population;
  }

  const maxAttempts = size * 80;
  let attempts = 0;
  while (population.length < size && attempts < maxAttempts) {
    attempts++;
    // Scale a random ray into the box until Ax ≤ b
    const raw = randomGenes(ctx);
    let scale = 1;
    for (let i = 0; i < model.resources.length; i++) {
      let usage = 0;
      for (let j = 0; j < model.products.length; j++) usage += model.A[i][j] * raw[j];
      if (usage > model.b[i] && usage > 1e-12) scale = Math.min(scale, (model.b[i] * 0.99) / usage);
    }
    const genes = raw.map((g, j) => clip(g * Math.max(0, scale), 0, bounds[j]));
    const ind = buildIndividual(genes, ctx);
    if (ind.feasible) population.push(ind);
  }
  while (population.length < size) {
    population.push(buildIndividual(randomGenes(ctx), ctx));
  }
  return population;
}

function compareFitness(a: number, b: number): number {
  return a - b;
}

function tournamentSelect(population: Individual[], ctx: GaContext): Individual {
  const { hyperparameters, rng } = ctx;
  const size = hyperparameters.tournamentSize;
  const candidates = Array.from(
    { length: size },
    () => population[Math.floor(rng() * population.length)],
  );
  candidates.sort((a, b) => compareFitness(b.fitness, a.fitness));
  if (rng() < hyperparameters.tournamentProbability) return { ...candidates[0], genes: [...candidates[0].genes] };
  const worst = candidates[candidates.length - 1];
  return { ...worst, genes: [...worst.genes] };
}

function rouletteSelect(population: Individual[], ctx: GaContext): Individual {
  const { rng } = ctx;
  const minFitness = Math.min(...population.map((p) => p.fitness));
  const offset = minFitness < 0 ? -minFitness + 1 : 0;
  const shifted = population.map((ind) => ind.fitness + offset + 1e-9);
  const total = shifted.reduce((sum, w) => sum + w, 0);
  let pick = rng() * total;
  for (let i = 0; i < population.length; i++) {
    pick -= shifted[i];
    if (pick <= 0) return { ...population[i], genes: [...population[i].genes] };
  }
  const last = population[population.length - 1];
  return { ...last, genes: [...last.genes] };
}

function rankSelect(population: Individual[], ctx: GaContext): Individual {
  const { rng } = ctx;
  const ranked = [...population].sort((a, b) => compareFitness(b.fitness, a.fitness));
  const weights = ranked.map((_, index) => ranked.length - index);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let pick = rng() * total;
  for (let i = 0; i < ranked.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return { ...ranked[i], genes: [...ranked[i].genes] };
  }
  const last = ranked[ranked.length - 1];
  return { ...last, genes: [...last.genes] };
}

function selectParent(population: Individual[], ctx: GaContext): Individual {
  switch (ctx.hyperparameters.selectionMethod) {
    case "tournament":
      return tournamentSelect(population, ctx);
    case "rank":
      return rankSelect(population, ctx);
    case "roulette":
    case "elitism":
    default:
      return rouletteSelect(population, ctx);
  }
}

function crossover(parentA: Individual, parentB: Individual, ctx: GaContext): number[] {
  const { hyperparameters, rng } = ctx;
  const n = parentA.genes.length;
  if (rng() > hyperparameters.crossoverProbability) return [...parentA.genes];

  const child = [...parentA.genes];
  switch (hyperparameters.crossoverType) {
    case "one-point": {
      const point = Math.max(1, Math.floor(rng() * n));
      for (let i = point; i < n; i++) child[i] = parentB.genes[i];
      break;
    }
    case "uniform":
    default:
      for (let i = 0; i < n; i++) {
        child[i] = rng() < hyperparameters.uniformBias ? parentB.genes[i] : parentA.genes[i];
      }
  }
  return child;
}

function mutate(genes: number[], ctx: GaContext): number[] {
  const { hyperparameters, rng, bounds } = ctx;
  if (rng() > hyperparameters.mutationProbability) return genes;
  const next = [...genes];
  for (let i = 0; i < next.length; i++) {
    if (rng() < 0.5) {
      const sigma = hyperparameters.mutationSigma * bounds[i];
      next[i] = clip(next[i] + (rng() * 2 - 1) * sigma, 0, bounds[i]);
    }
  }
  return next;
}

function nextGeneration(population: Individual[], ctx: GaContext): Individual[] {
  const { hyperparameters } = ctx;
  const sorted = [...population].sort((a, b) => compareFitness(b.fitness, a.fitness));
  const eliteCount =
    hyperparameters.selectionMethod === "elitism"
      ? Math.max(1, Math.floor(hyperparameters.eliteFraction * hyperparameters.populationSize))
      : 0;

  const next: Individual[] = sorted.slice(0, eliteCount).map((ind) => ({
    ...ind,
    genes: [...ind.genes],
  }));

  while (next.length < hyperparameters.populationSize) {
    const parentA = selectParent(population, ctx);
    const parentB = selectParent(population, ctx);
    let genes = crossover(parentA, parentB, ctx);
    genes = mutate(genes, ctx);
    next.push(buildIndividual(genes, ctx));
  }
  return next;
}

export interface GaSolveMeta {
  generations: number;
  bestRawFitness: number;
  feasible: boolean;
  gapToLp?: number;
  stopReason: GaStopReason;
  config: GaRunConfig;
  populationSampled: boolean;
}

function toSnapshot(ind: Individual): GaIndividualSnapshot {
  return {
    genes: [...ind.genes],
    rawFitness: ind.rawFitness,
    fitness: ind.fitness,
    penalty: ind.penalty,
    feasible: ind.feasible,
  };
}

function samplePopulation(
  population: Individual[],
  maxKeep: number,
  rng: () => number,
): Individual[] {
  if (population.length <= maxKeep) return population;
  const indexed = population.map((ind, i) => ({ ind, i }));
  // Keep best always, then reservoir-sample the rest.
  indexed.sort((a, b) => b.ind.fitness - a.ind.fitness);
  const kept = [indexed[0]];
  const rest = indexed.slice(1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = rest[i];
    rest[i] = rest[j];
    rest[j] = tmp;
  }
  kept.push(...rest.slice(0, maxKeep - 1));
  return kept.map((e) => e.ind);
}

function buildGenerationSnapshot(
  generation: number,
  population: Individual[],
  bestEver: Individual,
  maxPop: number,
  rng: () => number,
): { snap: GaGenerationSnapshot; sampled: boolean } {
  let sampled = false;
  let pop = population;
  if (pop.length > maxPop) {
    pop = samplePopulation(population, maxPop, rng);
    sampled = true;
  }
  let bestIndex = 0;
  let bestFitness = -Infinity;
  let worstFitness = Infinity;
  let sum = 0;
  let feasibleCount = 0;
  for (let i = 0; i < pop.length; i++) {
    const f = pop[i].fitness;
    sum += f;
    if (f > bestFitness) {
      bestFitness = f;
      bestIndex = i;
    }
    if (f < worstFitness) worstFitness = f;
    if (pop[i].feasible) feasibleCount++;
  }
  return {
    sampled,
    snap: {
      generation,
      population: pop.map(toSnapshot),
      bestIndex,
      bestEver: toSnapshot(bestEver),
      bestFitness,
      meanFitness: pop.length ? sum / pop.length : 0,
      worstFitness: Number.isFinite(worstFitness) ? worstFitness : 0,
      feasibleCount,
    },
  };
}

export type GaSolveRawResult = {
  x: number[];
  meta: GaSolveMeta;
  trace: SolveTrace;
};

export function solveGaRaw(
  model: Model,
  hyper: Partial<GaHyperparameters> = {},
  opts?: { preset?: GaPresetId; collectTrace?: boolean },
): GaSolveRawResult {
  const hyperparameters: GaHyperparameters = {
    ...DEFAULT_GA_HYPERPARAMS,
    ...hyper,
  };
  // Materialize random seed so provenance is reproducible.
  const concreteSeed =
    hyperparameters.seed == null
      ? (Math.floor(Math.random() * 0xffffffff) >>> 0)
      : hyperparameters.seed;
  const runHyper: GaHyperparameters = { ...hyperparameters, seed: concreteSeed };
  const preset = opts?.preset ?? "custom";
  const config = hyperToRunConfig(runHyper, preset);
  const collectTrace = opts?.collectTrace !== false;

  const ctx: GaContext = {
    model,
    bounds: variableBounds(model),
    hyperparameters: runHyper,
    rng: createRng(concreteSeed),
  };

  let population = initPopulation(ctx);
  let best = population.reduce((a, b) => (a.fitness >= b.fitness ? a : b));
  let stagnation = 0;
  let stopReason: GaStopReason = "maxGenerations";
  let generationsRun = 0;
  let populationSampled = false;

  const generations: GaGenerationSnapshot[] = [];
  const maxTotal = GA_TRACE_MAX_INDIVIDUALS;
  const maxPerGen = Math.min(
    GA_TRACE_MAX_POP_PER_GEN,
    runHyper.populationSize,
  );
  // Reserve budget across expected generations (pessimistic).
  const expectedGens = runHyper.maxGenerations + 1;
  const budgetPerGen = Math.max(
    8,
    Math.min(maxPerGen, Math.floor(maxTotal / Math.max(1, expectedGens))),
  );

  if (collectTrace) {
    const { snap, sampled } = buildGenerationSnapshot(
      0,
      population,
      best,
      budgetPerGen,
      ctx.rng,
    );
    generations.push(snap);
    populationSampled = populationSampled || sampled;
  }

  for (let generation = 1; generation <= runHyper.maxGenerations; generation++) {
    population = nextGeneration(population, ctx);
    generationsRun = generation;
    const genBest = population.reduce((a, b) =>
      a.fitness >= b.fitness ? a : b,
    );
    if (genBest.fitness > best.fitness + 1e-12) {
      best = genBest;
      stagnation = 0;
    } else {
      stagnation++;
    }

    if (collectTrace) {
      const { snap, sampled } = buildGenerationSnapshot(
        generation,
        population,
        best,
        budgetPerGen,
        ctx.rng,
      );
      generations.push(snap);
      populationSampled = populationSampled || sampled;
    }

    if (
      runHyper.useStagnation &&
      stagnation >= runHyper.stagnationGenerations
    ) {
      stopReason = "stagnation";
      break;
    }
  }

  const meta: GaSolveMeta = {
    generations: generationsRun,
    bestRawFitness: best.rawFitness,
    feasible: best.feasible,
    stopReason,
    config,
    populationSampled,
  };

  const traceMeta: GaTraceMeta = {
    stopReason,
    generationsRun,
    populationSampled,
    config,
  };

  return {
    x: best.genes,
    meta,
    trace: { method: "ga", generations, meta: traceMeta },
  };
}

export function solveGaModel(
  model: Model,
  hyper: Partial<GaHyperparameters> = {},
  opts?: { preset?: GaPresetId; collectTrace?: boolean },
): SolveResult & { ga_meta: GaSolveMeta; trace: SolveTrace } {
  const { x, meta, trace } = solveGaRaw(model, hyper, opts);
  // Duals from LP dual (contract requires shadow prices; GA itself is primal heuristic).
  const y = solveLocalLpDuals(model);
  const result = buildSolveResult(model, x, y, meta.feasible);
  return { ...result, ga_meta: meta, trace };
}
