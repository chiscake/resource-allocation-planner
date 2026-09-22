<script lang="ts">
	import { onMount } from 'svelte';
	import { loadGuest, saveGuest, type GuestWhatIfRow } from '$lib/db/guest';
	import {
		createBlankModel,
		cloneModel,
		buildDefaultMutations,
		type Model,
		type SolveResult,
		type SolveMethod,
		type WhatIfDefaults
	} from '$lib/domain';
	import {
		solveLocal,
		runMutationsLocal,
		getRoundPlanPreference,
		maybeRoundPlan
	} from '$lib/solver';
	import { t } from '$lib/i18n';
	import { modelSourceKey } from '$lib/components/model/lp-tableau';
	import LpModelMatrix from '$lib/components/model/LpModelMatrix.svelte';
	import PlanSolveControls from '$lib/components/model/PlanSolveControls.svelte';
	import SolveResultPanel from '$lib/components/model/SolveResultPanel.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { formatPlanNumber } from '$lib/components/model/format-plan-number';

	let {
		showLoginCta = true,
		compact = false
	}: {
		/** Show «Войти и сохранить» next to solve. */
		showLoginCta?: boolean;
		/** Tighter spacing when embedded on home. */
		compact?: boolean;
	} = $props();

	/** Kept for upload-on-login; not shown in guest UI. */
	let title = $state('');
	let model = $state<Model | null>(null);
	let result = $state<SolveResult | null>(null);
	let whatIfItems = $state<GuestWhatIfRow[]>([]);
	let error = $state('');
	let busy = $state(false);
	/** Bumps on every successful solve so result card always refreshes. */
	let solveEpoch = $state(0);
	let roundPlan = $state(getRoundPlanPreference());
	let activeTab = $state('plan');
	let includeSensitivity = $state(false);

	const solveMethod = $derived<SolveMethod>(
		activeTab === 'ipm' ? 'ipm' : activeTab === 'ga' ? 'ga' : 'lp'
	);
	const methodReady = $derived(activeTab !== '4d');

	const displayResult = $derived(
		result && model ? maybeRoundPlan(model, result, roundPlan) : null
	);

	function persist() {
		if (!model) return;
		saveGuest({
			title: title || t('newTask'),
			model,
			result: result ?? undefined,
			what_if_items: whatIfItems.length ? whatIfItems : undefined,
			updated_at: new Date().toISOString()
		});
	}

	function initFromGuest(guest: ReturnType<typeof loadGuest>) {
		if (guest?.model) {
			title = guest.title || t('newTask');
			model = cloneModel(guest.model as Model);
			result = (guest.result as SolveResult | undefined) ?? null;
			whatIfItems = guest.what_if_items ?? [];
			return;
		}
		title = t('newTask');
		model = createBlankModel();
		result = null;
		whatIfItems = [];
		persist();
	}

	// onMount (not afterNavigate): home embeds GuestWorkspace behind authReady,
	// so afterNavigate often missed the initial enter and left model null /
	// re-init on later navigations raced with solve.
	onMount(() => {
		roundPlan = getRoundPlanPreference();
		initFromGuest(loadGuest());
	});

	function onModelChange(next: Model) {
		const prevKey = model ? modelSourceKey(model) : '';
		const nextKey = modelSourceKey(next);
		model = next;
		// Only drop result when source data actually changed (ignore no-op matrix echoes).
		if (nextKey !== prevKey) {
			result = null;
			whatIfItems = [];
		}
		persist();
	}

	/** Empty/whitespace → null (omit family). Valid number → fraction. */
	function inputToPct(s: string): number | null {
		const trimmed = s.trim();
		if (trimmed === '') return null;
		const n = parseFloat(trimmed);
		return Number.isFinite(n) ? n / 100 : null;
	}

	function updateWhatIf(field: keyof WhatIfDefaults, raw: string) {
		if (!model) return;
		const next = cloneModel($state.snapshot(model));
		next.what_if_defaults = {
			...(next.what_if_defaults ?? {}),
			[field]: inputToPct(raw)
		};
		model = next;
		persist();
	}

	function doSolve() {
		if (!model || busy || !methodReady) return;
		busy = true;
		error = '';
		try {
			const snapshot = $state.snapshot(model);
			const res = solveLocal(snapshot, 'local', 0, solveMethod);
			if (res.status !== 'done' || !res.result) {
				error = res.solver_meta.rejected_reason ?? res.status;
				return;
			}
			model = snapshot;
			result = res.result;
			whatIfItems = [];

			if (includeSensitivity) {
				const mutations = buildDefaultMutations(snapshot);
				if (mutations.length > 0) {
					const pack = runMutationsLocal(snapshot, mutations, 'local', solveMethod);
					if (pack.status !== 'done') {
						error = pack.solver_meta.rejected_reason ?? pack.status;
						return;
					}
					whatIfItems = pack.items.map((item) => ({
						title: item.mutation.label ?? item.mutation.kind,
						Z: item.response.result?.Z ?? Number.NaN
					}));
				}
			}

			solveEpoch += 1;
			persist();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

{#if !model}
	<p class="text-text-muted">…</p>
{:else}
	<section class={['flex flex-col', compact ? 'gap-5' : 'gap-6']}>
		{#if error}
			<p class="rounded-[8px] bg-danger-bg px-3 py-2 text-sm text-danger-text">{error}</p>
		{/if}

		<Card>
			<p class="mb-2 text-sm font-medium">{t('modelMatrix')}</p>
			<LpModelMatrix {model} onchange={onModelChange} />
			<div class="mt-4">
				<PlanSolveControls
					{model}
					bind:activeTab
					bind:includeSensitivity
					{busy}
					{showLoginCta}
					onWhatIfChange={updateWhatIf}
					onSolve={doSolve}
				/>
			</div>
		</Card>

		{#if result && displayResult && model}
			{#key solveEpoch}
				<SolveResultPanel
					result={displayResult}
					bind:roundPlan
					productOrder={model.products}
					resourceOrder={model.resources}
				/>
			{/key}
		{/if}

		{#if whatIfItems.length}
			<Card>
				<h2 class="mb-3 text-lg font-medium">{t('whatIf')}</h2>
				<div class="overflow-x-auto">
					<table class="w-full text-left text-sm">
						<thead>
							<tr class="border-b border-border text-text-muted">
								<th class="py-2 pr-3">{t('mutation')}</th>
								<th class="py-2 text-right">Z</th>
							</tr>
						</thead>
						<tbody>
							{#each whatIfItems as row, i (`${row.title}-${i}`)}
								<tr class="border-b border-border-soft">
									<td class="py-2 pr-3">{row.title}</td>
									<td class="py-2 text-right font-mono tabular-nums">
										{formatPlanNumber(row.Z)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card>
		{/if}
	</section>
{/if}
