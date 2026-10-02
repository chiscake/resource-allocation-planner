import { env } from '$env/dynamic/public';
import { resolveVenue } from '$lib/solver/venue';
import { solveLocal, runMutationsLocal } from '$lib/solver';
import {
	isSolveEngine,
	isSolveMethod,
	type Model,
	type Mutation,
	type ResolvedVenue,
	type RunMutationsResponse,
	type SolveEngine,
	type SolveMethod,
	type SolveResponse
} from '$lib/domain';
import { supabase } from '$lib/db/supabase';

export type SolveCallOpts = {
	method?: SolveMethod;
	engine?: SolveEngine;
	/** One-shot Edge solve when true (requires session + online). */
	cloud?: boolean;
	options?: import('$lib/domain').SolveRunOptions;
};

async function edgePost<T>(path: string, body: unknown): Promise<T> {
	const { data: session } = await supabase.auth.getSession();
	const token = session.session?.access_token;
	if (!token) {
		throw new Error('auth_required_for_cloud');
	}
	const base = env.PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
	const res = await fetch(`${base}/functions/v1/${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
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

function venueFor(cloud?: boolean): ResolvedVenue {
	return resolveVenue({ forceCloud: cloud === true });
}

export async function solveModel(
	model: Model,
	methodOrOpts: SolveMethod | SolveCallOpts = 'lp',
	engine?: SolveEngine,
	cloud?: boolean
): Promise<SolveResponse> {
	const opts: SolveCallOpts =
		typeof methodOrOpts === 'string' || methodOrOpts == null
			? { method: methodOrOpts as SolveMethod | undefined, engine, cloud }
			: methodOrOpts;
	const m = normalizeMethod(opts.method);
	const e = normalizeEngine(opts.engine);
	const venue = venueFor(opts.cloud);
	if (venue === 'local') return solveLocal(model, 'local', 0, m, e, opts.options);
	try {
		return await edgePost<SolveResponse>('solve', {
			model,
			method: m,
			engine: e,
			options: opts.options
		});
	} catch {
		return solveLocal(model, 'local', 0, m, e, opts.options);
	}
}

export async function runMutations(
	model: Model,
	mutations: Mutation[],
	methodOrOpts: SolveMethod | SolveCallOpts = 'lp',
	engine?: SolveEngine,
	cloud?: boolean
): Promise<RunMutationsResponse> {
	const opts: SolveCallOpts =
		typeof methodOrOpts === 'string' || methodOrOpts == null
			? { method: methodOrOpts as SolveMethod | undefined, engine, cloud }
			: methodOrOpts;
	const m = normalizeMethod(opts.method);
	const e = normalizeEngine(opts.engine);
	const venue = venueFor(opts.cloud);
	if (venue === 'local')
		return runMutationsLocal(model, mutations, 'local', m, e, opts.options);
	try {
		return await edgePost<RunMutationsResponse>('run_mutations', {
			model,
			mutations,
			method: m,
			engine: e,
			options: opts.options
		});
	} catch {
		return runMutationsLocal(model, mutations, 'local', m, e, opts.options);
	}
}
