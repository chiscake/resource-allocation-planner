import { env } from '$env/dynamic/public';
import { resolveVenue } from '$lib/solver/venue';
import { solveLocal, runMutationsLocal } from '$lib/solver';
import {
	isSolveEngine,
	isSolveMethod,
	type Model,
	type Mutation,
	type RunMutationsResponse,
	type SolveEngine,
	type SolveMethod,
	type SolveResponse
} from '$lib/domain';
import { supabase } from '$lib/db/supabase';

async function edgePost<T>(path: string, body: unknown): Promise<T> {
	const { data: session } = await supabase.auth.getSession();
	const token = session.session?.access_token;
	const base = env.PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
	const res = await fetch(`${base}/functions/v1/${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: token ? `Bearer ${token}` : '',
			apikey: env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || res.statusText);
	}
	return (await res.json()) as T;
}

function normalizeMethod(method?: SolveMethod): SolveMethod {
	return isSolveMethod(method) ? method : 'lp';
}

function normalizeEngine(engine?: SolveEngine): SolveEngine | undefined {
	return isSolveEngine(engine) ? engine : undefined;
}

export async function solveModel(
	model: Model,
	method: SolveMethod = 'lp',
	engine?: SolveEngine
): Promise<SolveResponse> {
	const m = normalizeMethod(method);
	const e = normalizeEngine(engine);
	const venue = resolveVenue();
	if (venue === 'local') return solveLocal(model, 'local', 0, m, e);
	try {
		return await edgePost<SolveResponse>('solve', { model, method: m, engine: e });
	} catch {
		return solveLocal(model, 'local', 0, m, e);
	}
}

export async function runMutations(
	model: Model,
	mutations: Mutation[],
	method: SolveMethod = 'lp',
	engine?: SolveEngine
): Promise<RunMutationsResponse> {
	const m = normalizeMethod(method);
	const e = normalizeEngine(engine);
	const venue = resolveVenue();
	if (venue === 'local') return runMutationsLocal(model, mutations, 'local', m, e);
	try {
		return await edgePost<RunMutationsResponse>('run_mutations', {
			model,
			mutations,
			method: m,
			engine: e
		});
	} catch {
		return runMutationsLocal(model, mutations, 'local', m, e);
	}
}
