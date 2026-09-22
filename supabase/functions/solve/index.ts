import solver from 'npm:javascript-lp-solver@1.0.3';
import {
	LIMITS,
	SCHEMA_VERSION,
	libraryFor,
	type Model,
	type SolveMethod
} from '../_shared/solver/types.ts';
import { buildSolveResult } from '../_shared/solver/resultBuild.ts';
import { solveIpmModel } from '../_shared/solver/ipm.ts';
import { solveGaModel } from '../_shared/solver/ga.ts';

const cors: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...cors, 'Content-Type': 'application/json' }
	});
}

function isMethod(v: unknown): v is SolveMethod {
	return v === 'lp' || v === 'ipm' || v === 'ga';
}

function solveLp(model: Model) {
	const m = model.resources.length;
	const n = model.products.length;
	const constraints: Record<string, { max: number }> = {};
	for (let i = 0; i < m; i++) constraints[`r_${i}`] = { max: model.b[i] };
	const variables: Record<string, Record<string, number>> = {};
	for (let j = 0; j < n; j++) {
		const v: Record<string, number> = { profit: model.c[j] };
		for (let i = 0; i < m; i++) v[`r_${i}`] = model.A[i][j];
		variables[`x_${j}`] = v;
	}
	const primal = solver.Solve({ optimize: 'profit', opType: 'max', constraints, variables }) as Record<
		string,
		unknown
	>;

	const dConstraints: Record<string, { min: number }> = {};
	for (let j = 0; j < n; j++) dConstraints[`p_${j}`] = { min: model.c[j] };
	const dVariables: Record<string, Record<string, number>> = {};
	for (let i = 0; i < m; i++) {
		const v: Record<string, number> = { cost: model.b[i] };
		for (let j = 0; j < n; j++) v[`p_${j}`] = model.A[i][j];
		dVariables[`y_${i}`] = v;
	}
	const dual = solver.Solve({
		optimize: 'cost',
		opType: 'min',
		constraints: dConstraints,
		variables: dVariables
	}) as Record<string, unknown>;

	const xVec = model.products.map((_, j) => Number(primal[`x_${j}`] ?? 0));
	const yVec = model.resources.map((_, i) => Math.max(0, Number(dual[`y_${i}`] ?? 0)));
	return buildSolveResult(model, xVec, yVec, Boolean(primal.feasible));
}

function solveModel(model: Model, method: SolveMethod) {
	const started = performance.now();
	const venue = 'cloud' as const;
	if (model.schema_version !== SCHEMA_VERSION) {
		return {
			status: 'rejected_too_large',
			solver_meta: {
				venue,
				library: libraryFor(method, venue),
				method,
				duration_ms: 0,
				rejected_reason: 'schema'
			}
		};
	}
	const n = model.products.length;
	const m = model.resources.length;
	if (n > LIMITS.maxVariables || m > LIMITS.maxConstraints || m * n > LIMITS.maxDenseCells) {
		return {
			status: 'rejected_too_large',
			solver_meta: {
				venue,
				library: libraryFor(method, venue),
				method,
				duration_ms: 0,
				rejected_reason: 'size',
				hint: 'solve_locally'
			}
		};
	}

	try {
		if (method === 'lp') {
			const result = solveLp(model);
			return {
				status: 'done',
				result,
				solver_meta: {
					venue,
					library: libraryFor('lp', venue),
					method: 'lp',
					duration_ms: performance.now() - started
				}
			};
		}
		if (method === 'ipm') {
			const result = solveIpmModel(model);
			if (!result) {
				return {
					status: 'rejected_too_large',
					solver_meta: {
						venue,
						library: libraryFor('ipm', venue),
						method: 'ipm',
						duration_ms: performance.now() - started,
						rejected_reason: 'ipm_failed'
					}
				};
			}
			return {
				status: 'done',
				result,
				solver_meta: {
					venue,
					library: libraryFor('ipm', venue),
					method: 'ipm',
					duration_ms: performance.now() - started
				}
			};
		}
		const ga = solveGaModel(model);
		const { ga_meta, ...result } = ga;
		let gap_vs_lp: number | undefined;
		try {
			const lp = solveLp(model);
			if (lp.Z > 1e-6) gap_vs_lp = Math.max(0, (lp.Z - result.Z) / lp.Z);
		} catch {
			/* ignore */
		}
		return {
			status: 'done',
			result,
			solver_meta: {
				venue,
				library: libraryFor('ga', venue),
				method: 'ga',
				duration_ms: performance.now() - started,
				gap_vs_lp,
				hint: ga_meta.feasible ? undefined : 'infeasible_best'
			}
		};
	} catch (e) {
		return {
			status: 'rejected_too_large',
			solver_meta: {
				venue,
				library: libraryFor(method, venue),
				method,
				duration_ms: performance.now() - started,
				rejected_reason: e instanceof Error ? e.message : 'error'
			}
		};
	}
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
	if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
	try {
		const body = (await req.json()) as { model?: Model; method?: unknown };
		if (!body.model) return json({ error: 'model required' }, 400);
		const method: SolveMethod = isMethod(body.method) ? body.method : 'lp';
		return json(solveModel(body.model, method));
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'error' }, 500);
	}
});
