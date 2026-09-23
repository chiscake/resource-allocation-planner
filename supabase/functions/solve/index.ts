import {
	type Model,
	type SolveEngine,
	type SolveMethod
} from '../_shared/solver/types.ts';
import { runSolve } from '../_shared/solver/run.ts';

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

function isEngine(v: unknown): v is SolveEngine {
	return v === 'native' || v === 'library';
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
	if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
	try {
		const body = (await req.json()) as {
			model?: Model;
			method?: unknown;
			engine?: unknown;
		};
		if (!body.model) return json({ error: 'model required' }, 400);
		const method: SolveMethod = isMethod(body.method) ? body.method : 'lp';
		const engine = isEngine(body.engine) ? body.engine : undefined;
		return json(runSolve(body.model, method, engine));
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'error' }, 500);
	}
});
