<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/db/supabase';
	import {
		createSolveNode,
		modelFromTemplate
	} from '$lib/db/create-solve-node';
	import {
		blankTaskDraft,
		clearTaskDraft,
		loadTaskDraft,
		saveTaskDraft,
		type TaskDraft
	} from '$lib/db/task-draft';
	import { recordPublicTemplateUse } from '$lib/db/template-uses';
	import { solveModel, runMutations } from '$lib/api/solve';
	import {
		buildDefaultMutations,
		cloneModel,
		type Model,
		type SolveMethod,
		type SolveResult,
		type WhatIfDefaults
	} from '$lib/domain';
	import {
		getRoundPlanPreference,
		maybeRoundPlan
	} from '$lib/solver';
	import { modelSourceKey } from '$lib/components/model/lp-tableau';
	import { t } from '$lib/i18n';
	import LpModelMatrix from '$lib/components/model/LpModelMatrix.svelte';
	import PlanSolveControls from '$lib/components/model/PlanSolveControls.svelte';
	import SolveResultPanel from '$lib/components/model/SolveResultPanel.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import { formatPlanNumber } from '$lib/components/model/format-plan-number';

	type WhatIfRow = { title: string; Z: number };

	let title = $state(t('newTask'));
	let model = $state<Model | null>(null);
	let result = $state<SolveResult | null>(null);
	let whatIfItems = $state<WhatIfRow[]>([]);
	let error = $state('');
	let busy = $state(false);
	let solveEpoch = $state(0);
	let roundPlan = $state(getRoundPlanPreference());
	let activeTab = $state('plan');
	let includeSensitivity = $state(false);
	let draftHint = $state(true);
	let ready = $state(false);

	const solveMethod = $derived<SolveMethod>(
		activeTab === 'ipm' ? 'ipm' : activeTab === 'ga' ? 'ga' : 'lp'
	);
	const methodReady = $derived(activeTab !== '4d');
	const displayResult = $derived(
		result && model ? maybeRoundPlan(model, result, roundPlan) : null
	);

	function persistLocal() {
		if (!model) return;
		const draft: TaskDraft = {
			title: title.trim() || t('newTask'),
			model: cloneModel(model),
			templateId: page.url.searchParams.get('template'),
			activeTab,
			includeSensitivity,
			updated_at: new Date().toISOString()
		};
		saveTaskDraft(draft);
	}

	function applyDraft(draft: TaskDraft) {
		title = draft.title || t('newTask');
		model = cloneModel(draft.model);
		activeTab = draft.activeTab ?? 'plan';
		includeSensitivity = draft.includeSensitivity ?? false;
		result = null;
		whatIfItems = [];
	}

	async function loadTemplateIntoDraft(templateId: string): Promise<boolean> {
		const { data, error: qErr } = await supabase
			.from('templates')
			.select('id, title, model, what_if, system_kind')
			.eq('id', templateId)
			.is('deleted_at', null)
			.single();
		if (qErr || !data) {
			error = qErr?.message ?? t('notFound');
			return false;
		}
		await recordPublicTemplateUse(templateId);
		applyDraft({
			title: data.title,
			model: modelFromTemplate(data),
			templateId,
			activeTab: 'plan',
			includeSensitivity: false,
			updated_at: new Date().toISOString()
		});
		persistLocal();
		return true;
	}

	onMount(() => {
		void (async () => {
			const { data: auth } = await supabase.auth.getUser();
			if (!auth.user) {
				await goto('/login');
				return;
			}
			roundPlan = getRoundPlanPreference();
			const templateId = page.url.searchParams.get('template');
			if (templateId) {
				const ok = await loadTemplateIntoDraft(templateId);
				if (!ok) {
					const existing = loadTaskDraft();
					applyDraft(existing ?? blankTaskDraft());
				}
			} else {
				const existing = loadTaskDraft();
				applyDraft(existing ?? blankTaskDraft());
				persistLocal();
			}
			ready = true;
		})();
	});

	function onModelChange(next: Model) {
		const prevKey = model ? modelSourceKey(model) : '';
		const nextKey = modelSourceKey(next);
		model = next;
		if (nextKey !== prevKey) {
			result = null;
			whatIfItems = [];
		}
		persistLocal();
	}

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
		persistLocal();
	}

	function renameDraft(nextTitle: string) {
		const trimmed = nextTitle.trim();
		if (!trimmed) return;
		title = trimmed;
		persistLocal();
	}

	async function doSolve() {
		if (!model || busy || !methodReady) return;
		busy = true;
		error = '';
		try {
			const snapshot = $state.snapshot(model);
			const res = await solveModel(snapshot, solveMethod);
			// Any solve status (done | accepted | rejected_too_large) → persist to DB.
			model = snapshot;
			result = res.result ?? null;
			whatIfItems = [];
			solveEpoch += 1;

			const created = await createSolveNode(snapshot, title.trim() || t('newTask'), {
				result: res.result ?? null,
				solver_meta: res.solver_meta ?? null
			});
			if ('error' in created) {
				error = created.error;
				persistLocal();
				return;
			}

			if (res.status === 'done' && includeSensitivity) {
				const mutations = buildDefaultMutations(snapshot);
				if (mutations.length > 0) {
					const pack = await runMutations(snapshot, mutations, solveMethod);
					if (pack.status === 'done') {
						const {
							data: { user }
						} = await supabase.auth.getUser();
						if (user) {
							const rows = pack.items.map((item) => ({
								owner_id: user.id,
								parent_id: created.id,
								kind: 'sensitivity',
								title: item.mutation.label ?? item.mutation.kind,
								model: item.model,
								mutation: item.mutation,
								result: item.response.result ?? null,
								solver_meta: item.response.solver_meta,
								what_if_generation: 1
							}));
							await supabase.from('solve_nodes').insert(rows);
							whatIfItems = pack.items.map((item) => ({
								title: item.mutation.label ?? item.mutation.kind,
								Z: item.response.result?.Z ?? Number.NaN
							}));
						}
					}
				}
			}

			if (res.status !== 'done') {
				error = res.solver_meta.rejected_reason ?? res.status;
			}

			clearTaskDraft();
			await goto(`/app/task/${created.id}`, { replaceState: true });
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			persistLocal();
		} finally {
			busy = false;
		}
	}
</script>

{#if !ready || !model}
	<p class="text-sm text-text-muted">…</p>
{:else}
	<section class="mx-auto flex w-full max-w-6xl flex-col gap-6">
		<PageHeader
			title={title}
			editable
			ontitlecommit={renameDraft}
			description={draftHint ? t('draftNotSavedHint') : undefined}
		/>

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
					onWhatIfChange={updateWhatIf}
					onSolve={doSolve}
				/>
			</div>
			<p class="mt-3 text-xs text-text-soft">{t('draftPersistOnSolve')}</p>
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
