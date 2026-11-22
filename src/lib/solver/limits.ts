export const SOLVE_LIMITS = {
  maxVariables: 200,
  maxConstraints: 200,
  maxDenseCells: 20_000,
  maxBodyBytes: 512 * 1024,
  singleSolveMs: 5_000,
  mutationMaxK: 64,
  mutationBudgetMs: 15_000,
} as const;

export interface SizeCheck {
  ok: boolean;
  reasons: string[];
}

export function checkModelSize(nVars: number, nCons: number, bodyBytes = 0): SizeCheck {
  const reasons: string[] = [];
  if (nVars > SOLVE_LIMITS.maxVariables) reasons.push(`n>${SOLVE_LIMITS.maxVariables}`);
  if (nCons > SOLVE_LIMITS.maxConstraints) reasons.push(`m>${SOLVE_LIMITS.maxConstraints}`);
  if (nVars * nCons > SOLVE_LIMITS.maxDenseCells) {
    reasons.push(`m*n>${SOLVE_LIMITS.maxDenseCells}`);
  }
  if (bodyBytes > SOLVE_LIMITS.maxBodyBytes) reasons.push(`body>${SOLVE_LIMITS.maxBodyBytes}`);
  return { ok: reasons.length === 0, reasons };
}
