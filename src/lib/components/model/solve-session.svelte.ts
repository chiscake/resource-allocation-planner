import {
	buildDefaultMutations,
	cloneModel,
	type Model,
	type Mutation,
	type RunMutationsResponse,
	type SolveMethod,
	type SolveResponse,
	type SolveResult,
	type WhatIfDefaults
} from '$lib/domain';
import { getRoundPlanPreference, maybeRoundPlan } from '$lib/display';
import { modelSourceKey } from '$lib/components/model/lp-tableau';

export type SolveTabId = 'plan' | 'ipm' | 'ga' | '4d';

export type WhatIfRow = { title: string; Z: number };

/** Empty/whitespace → null (omit family). Valid number → fraction. */
export function inputToPct(s: string): number | null {
	const trimmed = s.trim();
	if (trimmed === '') return null;
	const n = parseFloat(trimmed);
	return Number.isFinite(n) ? n / 100 : null;
}

export function tabToSolveMethod(tab: string): SolveMethod {
	if (tab === 'ipm') return 'ipm';
	if (tab === 'ga') return 'ga';
	return 'lp';
}

export function solveMethodToTab(method: SolveMethod): SolveTabId {
	if (method === 'ipm') return 'ipm';
	if (method === 'ga') return 'ga';
	return 'plan';
}

export function whatIfRowsFromMutations(pack: RunMutationsResponse): WhatIfRow[] {
	return pack.items.map((item) => ({
		title: item.mutation.label ?? item.mutation.kind,
		Z: item.response.result?.Z ?? Number.NaN
	}));
}

export type SolveTransport = {
	solve: (model: Model, method: SolveMethod) => Promise<SolveResponse>;
	runMutations: (
		model: Model,
		mutations: Mutation[],
		method: SolveMethod
	) => Promise<RunMutationsResponse>;
};

export type AfterSolveCtx = {
	model: Model;
	result: SolveResult | null;
	response: SolveResponse;
	method: SolveMethod;
};

export type SolveCycleResult = {
	model: Model;
	result: SolveResult | null;
	response: SolveResponse;
	whatIfItems: WhatIfRow[];
	mutationsResponse: RunMutationsResponse | null;
	method: SolveMethod;
};

export type SolveSession = ReturnType<typeof createSolveSession>;

/**
 * Shared solve-editor session: tabs↔method, what-if %, round display, solve cycle.
 * Persist stays in the caller via afterSolve / post-cycle hooks.
 */
export function createSolveSession(init?: {
	activeTab?: string;
	includeSensitivity?: boolean;
	model?: Model | null;
	result?: SolveResult | null;
}) {
	let activeTab = $state(init?.activeTab ?? 'plan');
	let includeSensitivity = $state(init?.includeSensitivity ?? false);
	let roundPlan = $state(false);
	let busy = $state(false);
	let error = $state('');
	let solveEpoch = $state(0);
	let model = $state<Model | null>(init?.model ?? null);
	let result = $state<SolveResult | null>(init?.result ?? null);
	let whatIfItems = $state<WhatIfRow[]>([]);

	const solveMethod = $derived(tabToSolveMethod(activeTab));
	const methodReady = $derived(activeTab !== '4d');
	const displayResult = $derived(
		result && model ? maybeRoundPlan(model, result, roundPlan) : null
	);

	function loadRoundPref() {
		roundPlan = getRoundPlanPreference();
	}

	function replaceModel(next: Model, opts?: { clearDerived?: boolean }) {
		const clear = opts?.clearDerived ?? true;
		const prevKey = model ? modelSourceKey(model) : '';
		const nextKey = modelSourceKey(next);
		model = next;
		if (clear && nextKey !== prevKey) {
			result = null;
			whatIfItems = [];
		}
	}

	function updateWhatIf(field: keyof WhatIfDefaults, raw: string) {
		if (!model) return;
		const next = cloneModel($state.snapshot(model));
		next.what_if_defaults = {
			...(next.what_if_defaults ?? {}),
			[field]: inputToPct(raw)
		};
		model = next;
	}

	function hydrate(next: {
		model: Model;
		result?: SolveResult | null;
		activeTab?: string;
		includeSensitivity?: boolean;
		whatIfItems?: WhatIfRow[];
	}) {
		model = cloneModel(next.model);
		result = next.result ?? null;
		if (next.activeTab != null) activeTab = next.activeTab;
		if (next.includeSensitivity != null) includeSensitivity = next.includeSensitivity;
		whatIfItems = next.whatIfItems ?? [];
	}

	/**
	 * Primary solve + optional sensitivity pack.
	 * `afterSolve`: return `false` to skip mutations (and treat as abort for caller).
	 */
	async function runSolveCycle(
		transport: SolveTransport,
		opts?: {
			afterSolve?: (ctx: AfterSolveCtx) => Promise<boolean | void>;
		}
	): Promise<SolveCycleResult | null> {
		if (!model || busy || !methodReady) return null;
		busy = true;
		error = '';
		try {
			const snapshot = $state.snapshot(model);
			const method = tabToSolveMethod(activeTab);
			const response = await transport.solve(snapshot, method);
			model = snapshot;
			result = response.result ?? null;
			whatIfItems = [];
			solveEpoch += 1;

			const after = await opts?.afterSolve?.({
				model: snapshot,
				result: response.result ?? null,
				response,
				method
			});
			if (after === false) {
				return {
					model: snapshot,
					result: response.result ?? null,
					response,
					whatIfItems: [],
					mutationsResponse: null,
					method
				};
			}

			let mutationsResponse: RunMutationsResponse | null = null;
			if (response.status === 'done' && includeSensitivity) {
				const mutations = buildDefaultMutations(snapshot);
				if (mutations.length > 0) {
					mutationsResponse = await transport.runMutations(snapshot, mutations, method);
					if (mutationsResponse.status === 'done') {
						whatIfItems = whatIfRowsFromMutations(mutationsResponse);
					} else {
						error =
							mutationsResponse.solver_meta.rejected_reason ?? mutationsResponse.status;
					}
				}
			} else if (response.status !== 'done') {
				error = response.solver_meta.rejected_reason ?? response.status;
			}

			return {
				model: snapshot,
				result: response.result ?? null,
				response,
				whatIfItems: [...whatIfItems],
				mutationsResponse,
				method
			};
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			return null;
		} finally {
			busy = false;
		}
	}

	return {
		get activeTab() {
			return activeTab;
		},
		set activeTab(v: string) {
			activeTab = v;
		},
		get includeSensitivity() {
			return includeSensitivity;
		},
		set includeSensitivity(v: boolean) {
			includeSensitivity = v;
		},
		get roundPlan() {
			return roundPlan;
		},
		set roundPlan(v: boolean) {
			roundPlan = v;
		},
		get busy() {
			return busy;
		},
		set busy(v: boolean) {
			busy = v;
		},
		get error() {
			return error;
		},
		set error(v: string) {
			error = v;
		},
		get solveEpoch() {
			return solveEpoch;
		},
		get model() {
			return model;
		},
		set model(v: Model | null) {
			model = v;
		},
		get result() {
			return result;
		},
		set result(v: SolveResult | null) {
			result = v;
		},
		get whatIfItems() {
			return whatIfItems;
		},
		set whatIfItems(v: WhatIfRow[]) {
			whatIfItems = v;
		},
		get solveMethod() {
			return solveMethod;
		},
		get methodReady() {
			return methodReady;
		},
		get displayResult() {
			return displayResult;
		},
		loadRoundPref,
		replaceModel,
		updateWhatIf,
		hydrate,
		runSolveCycle
	};
}
