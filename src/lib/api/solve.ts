import { env } from '$env/dynamic/public';
import { resolveVenue } from '$lib/solver/venue';
import { solveLocal, runMutationsLocal } from '$lib/solver';
import type { Model, Mutation, RunMutationsResponse, SolveResponse } from '$lib/domain';
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

export async function solveModel(model: Model): Promise<SolveResponse> {
	const venue = resolveVenue();
	if (venue === 'local') return solveLocal(model, 'local');
	try {
		return await edgePost<SolveResponse>('solve', { model });
	} catch {
		return solveLocal(model, 'local');
	}
}

export async function runMutations(
	model: Model,
	mutations: Mutation[]
): Promise<RunMutationsResponse> {
	const venue = resolveVenue();
	if (venue === 'local') return runMutationsLocal(model, mutations, 'local');
	try {
		return await edgePost<RunMutationsResponse>('run_mutations', { model, mutations });
	} catch {
		return runMutationsLocal(model, mutations, 'local');
	}
}
