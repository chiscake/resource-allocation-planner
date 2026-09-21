import { createClient } from 'npm:@supabase/supabase-js@2';

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

/** Inline solver mirror — keep in sync with src/lib/solver (Deno Edge cannot import app $lib). */
import solver from 'npm:javascript-lp-solver@1.0.3';

const SCHEMA_VERSION = 1;
const LIMITS = { maxVariables: 200, maxConstraints: 200, maxDenseCells: 20_000, singleSolveMs: 5000 };

type Model = {
	schema_version: number;
	resources: string[];
	products: string[];
	A: number[][];
	b: number[];
	c: number[];
};

function solveModel(model: Model) {
	const started = performance.now();
	if (model.schema_version !== SCHEMA_VERSION) {
		return {
			status: 'rejected_too_large',
			solver_meta: { venue: 'cloud', library: 'javascript-lp-solver', duration_ms: 0, rejected_reason: 'schema' }
		};
	}
	const n = model.products.length;
	const m = model.resources.length;
	if (n > LIMITS.maxVariables || m > LIMITS.maxConstraints || m * n > LIMITS.maxDenseCells) {
		return {
			status: 'rejected_too_large',
			solver_meta: {
				venue: 'cloud',
				library: 'javascript-lp-solver',
				duration_ms: 0,
				rejected_reason: 'size',
				hint: 'solve_locally'
			}
		};
	}

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
	const dual = solver.Solve({ optimize: 'cost', opType: 'min', constraints: dConstraints, variables: dVariables }) as Record<
		string,
		unknown
	>;

	const x: Record<string, number> = {};
	for (let j = 0; j < n; j++) x[model.products[j]] = Number(primal[`x_${j}`] ?? 0);
	const Z = Number(primal.result ?? 0);
	const resource_usage: Record<string, number> = {};
	const resource_slack: Record<string, number> = {};
	const shadow_prices: Record<string, number> = {};
	const critical_resources: string[] = [];
	const non_critical_resources: string[] = [];
	for (let i = 0; i < m; i++) {
		let usage = 0;
		for (let j = 0; j < n; j++) usage += model.A[i][j] * x[model.products[j]];
		const name = model.resources[i];
		resource_usage[name] = usage;
		resource_slack[name] = model.b[i] - usage;
		const sp = Math.max(0, Number(dual[`y_${i}`] ?? 0));
		shadow_prices[name] = sp < 1e-6 ? 0 : sp;
		if (shadow_prices[name] > 1e-4) critical_resources.push(name);
		else non_critical_resources.push(name);
	}

	return {
		status: 'done',
		result: {
			x,
			Z,
			resource_usage,
			resource_slack,
			shadow_prices,
			critical_resources,
			non_critical_resources,
			feasible: Boolean(primal.feasible)
		},
		solver_meta: {
			venue: 'cloud',
			library: 'javascript-lp-solver',
			duration_ms: performance.now() - started
		}
	};
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
	if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
	try {
		const body = (await req.json()) as { model?: Model };
		if (!body.model) return json({ error: 'model required' }, 400);
		return json(solveModel(body.model));
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'error' }, 500);
	}
});
