import {
	LIMITS,
	libraryFor,
	type Model,
	type SolveMethod
} from '../_shared/solver/types.ts';

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

type Mutation = { kind: string; target: string; delta: number; label?: string };

function isMethod(v: unknown): v is SolveMethod {
	return v === 'lp' || v === 'ipm' || v === 'ga';
}

function applyMutation(model: Model, mutation: Mutation): Model {
	const next = structuredClone(model);
	if (mutation.kind === 'resource_change') {
		const i = next.resources.indexOf(mutation.target);
		if (i >= 0) next.b[i] *= 1 + mutation.delta;
	} else if (mutation.kind === 'modernization') {
		const j = next.products.indexOf(mutation.target);
		if (j >= 0) for (let i = 0; i < next.resources.length; i++) next.A[i][j] *= 1 + mutation.delta;
	} else if (mutation.kind === 'price_change') {
		const j = next.products.indexOf(mutation.target);
		if (j >= 0) next.c[j] *= 1 + mutation.delta;
	}
	return next;
}

/** Delegate to the same solve function module by inlining a fetch-free import. */
import solver from 'npm:javascript-lp-solver@1.0.3';
import { buildSolveResult } from '../_shared/solver/resultBuild.ts';
import { solveIpmModel } from '../_shared/solver/ipm.ts';
import { solveGaModel } from '../_shared/solver/ga.ts';
import { SCHEMA_VERSION } from '../_shared/solver/types.ts';

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
	return {
		status: 'done' as const,
		result: buildSolveResult(model, xVec, yVec, Boolean(primal.feasible)),
		solver_meta: {
			venue: 'cloud' as const,
			library: libraryFor('lp', 'cloud'),
			method: 'lp' as const,
			duration_ms: 0
		}
	};
}

function solveOne(model: Model, method: SolveMethod) {
	if (model.schema_version !== SCHEMA_VERSION) {
		return {
			status: 'rejected_too_large' as const,
			solver_meta: {
				venue: 'cloud' as const,
				library: libraryFor(method, 'cloud'),
				method,
				duration_ms: 0,
				rejected_reason: 'schema'
			}
		};
	}
	if (method === 'lp') return solveLp(model);
	if (method === 'ipm') {
		const result = solveIpmModel(model);
		if (!result) {
			return {
				status: 'rejected_too_large' as const,
				solver_meta: {
					venue: 'cloud' as const,
					library: libraryFor('ipm', 'cloud'),
					method: 'ipm' as const,
					duration_ms: 0,
					rejected_reason: 'ipm_failed'
				}
			};
		}
		return {
			status: 'done' as const,
			result,
			solver_meta: {
				venue: 'cloud' as const,
				library: libraryFor('ipm', 'cloud'),
				method: 'ipm' as const,
				duration_ms: 0
			}
		};
	}
	const ga = solveGaModel(model);
	const { ga_meta, ...result } = ga;
	return {
		status: 'done' as const,
		result,
		solver_meta: {
			venue: 'cloud' as const,
			library: libraryFor('ga', 'cloud'),
			method: 'ga' as const,
			duration_ms: 0,
			hint: ga_meta.feasible ? undefined : 'infeasible_best'
		}
	};
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
	if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
	try {
		const body = (await req.json()) as {
			model?: Model;
			mutations?: Mutation[];
			method?: unknown;
		};
		if (!body.model || !body.mutations) return json({ error: 'model and mutations required' }, 400);
		const method: SolveMethod = isMethod(body.method) ? body.method : 'lp';
		if (body.mutations.length > LIMITS.mutationMaxK) {
			return json({
				status: 'rejected_too_large',
				items: [],
				solver_meta: {
					venue: 'cloud',
					library: libraryFor(method, 'cloud'),
					method,
					duration_ms: 0,
					rejected_reason: `K>${LIMITS.mutationMaxK}`
				}
			});
		}
		const started = performance.now();
		const items = [];
		for (const mutation of body.mutations) {
			const model = applyMutation(body.model, mutation);
			const response = solveOne(model, method);
			items.push({ mutation, model, response });
		}
		return json({
			status: 'done',
			items,
			solver_meta: {
				venue: 'cloud',
				library: libraryFor(method, 'cloud'),
				method,
				duration_ms: performance.now() - started
			}
		});
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'error' }, 500);
	}
});
