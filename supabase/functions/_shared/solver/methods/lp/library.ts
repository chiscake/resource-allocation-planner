import solver from 'npm:javascript-lp-solver@1.0.3';
import type { Model, SolveResult } from '../../types.ts';
import { buildSolveResult } from '../../shared/resultBuild.ts';
import { engineFail, engineOk, type SolverEngine } from '../../contract.ts';

function buildPrimalModel(model: Model) {
  const constraints: Record<string, { max: number }> = {};
  for (let i = 0; i < model.resources.length; i++) {
    constraints[`r_${i}`] = { max: model.b[i] };
  }
  const variables: Record<string, Record<string, number>> = {};
  for (let j = 0; j < model.products.length; j++) {
    const v: Record<string, number> = { profit: model.c[j] };
    for (let i = 0; i < model.resources.length; i++) {
      v[`r_${i}`] = model.A[i][j];
    }
    variables[`x_${j}`] = v;
  }
  return { optimize: 'profit', opType: 'max' as const, constraints, variables };
}

function buildDualModel(model: Model) {
  const constraints: Record<string, { min: number }> = {};
  for (let j = 0; j < model.products.length; j++) {
    constraints[`p_${j}`] = { min: model.c[j] };
  }
  const variables: Record<string, Record<string, number>> = {};
  for (let i = 0; i < model.resources.length; i++) {
    const v: Record<string, number> = { cost: model.b[i] };
    for (let j = 0; j < model.products.length; j++) {
      v[`p_${j}`] = model.A[i][j];
    }
    variables[`y_${i}`] = v;
  }
  return { optimize: 'cost', opType: 'min' as const, constraints, variables };
}

export function solveLpLibrary(model: Model): SolveResult {
  const primal = solver.Solve(buildPrimalModel(model)) as Record<string, unknown>;
  const dual = solver.Solve(buildDualModel(model)) as Record<string, unknown>;
  const xVec = model.products.map((_, j) => Number(primal[`x_${j}`] ?? 0));
  const yVec = model.resources.map((_, i) => Math.max(0, Number(dual[`y_${i}`] ?? 0)));
  return buildSolveResult(model, xVec, yVec, Boolean(primal.feasible));
}

export const lpLibraryEngine: SolverEngine = {
  method: 'lp',
  engine: 'library',
  solve(model) {
    try {
      return engineOk({ result: solveLpLibrary(model) });
    } catch (e) {
      return engineFail(e instanceof Error ? e.message : 'error');
    }
  },
};
