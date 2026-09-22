<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { t } from '$lib/i18n';
	import type { Model, SolveResult } from '$lib/domain';
	import {
		getRoundPlanPreference,
		setRoundPlanPreference,
		maybeRoundPlan
	} from '$lib/solver';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	type NodeView = { title: string; result: SolveResult | null; model: Model | null };

	let a = $state('');
	let b = $state('');
	let left = $state<NodeView | null>(null);
	let right = $state<NodeView | null>(null);
	let nodes = $state<{ id: string; title: string }[]>([]);
	let saved = $state<{ id: string; node_ids: string[] }[]>([]);
	let roundPlan = $state(false);

	const nodeOptions = $derived(nodes.map((n) => ({ value: n.id, label: n.title })));

	function shown(side: NodeView): SolveResult | null {
		if (!side.result || !side.model) return side.result;
		return maybeRoundPlan(side.model, side.result, roundPlan);
	}

	async function loadSaved() {
		const { data } = await supabase
			.from('comparisons')
			.select('id, node_ids')
			.order('created_at', { ascending: false })
			.limit(20);
		saved = (data ?? []) as typeof saved;
	}

	onMount(async () => {
		roundPlan = getRoundPlanPreference();
		const { data } = await supabase
			.from('solve_nodes')
			.select('id, title')
			.is('parent_id', null)
			.is('deleted_at', null);
		nodes = (data ?? []) as typeof nodes;
		await loadSaved();
	});

	async function run() {
		const { data: d1 } = await supabase
			.from('solve_nodes')
			.select('title, result, model')
			.eq('id', a)
			.single();
		const { data: d2 } = await supabase
			.from('solve_nodes')
			.select('title, result, model')
			.eq('id', b)
			.single();
		left = d1 as NodeView;
		right = d2 as NodeView;
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (user && a && b) {
			await supabase.from('comparisons').insert({
				owner_id: user.id,
				node_ids: [a, b]
			});
			await loadSaved();
		}
	}

	async function hardDelete(id: string) {
		await supabase.from('comparisons').delete().eq('id', id);
		await loadSaved();
	}

	async function reopen(ids: string[]) {
		if (ids.length < 2) return;
		a = ids[0];
		b = ids[1];
		await run();
	}

	function nodeTitle(id: string): string {
		return nodes.find((n) => n.id === id)?.title ?? id.slice(0, 8);
	}
</script>

<section class="mx-auto max-w-4xl space-y-6">
	<PageHeader title={t('compare')} description={t('compareHint')} />

	<Card>
		<div class="flex flex-col gap-3">
			<div class="flex flex-wrap items-end gap-3">
				<div class="min-w-[12rem] flex-1">
					<label class="mb-1 block text-xs text-text-muted" for="compare-a">Сценарий A</label>
					<Select id="compare-a" bind:value={a} options={nodeOptions} placeholder="Выберите A" />
				</div>
				<div class="min-w-[12rem] flex-1">
					<label class="mb-1 block text-xs text-text-muted" for="compare-b">Сценарий B</label>
					<Select id="compare-b" bind:value={b} options={nodeOptions} placeholder="Выберите B" />
				</div>
			</div>
			<div class="flex justify-end">
				<Button disabled={!a || !b} onclick={run}>Сравнить</Button>
			</div>
		</div>
	</Card>

	{#if left && right}
		<label class="flex items-center gap-2 text-sm">
			<input
				type="checkbox"
				checked={roundPlan}
				onchange={(e) => {
					roundPlan = e.currentTarget.checked;
					setRoundPlanPreference(roundPlan);
				}}
			/>
			{t('roundPlan')}
		</label>
		<p class="text-xs text-text-soft">{t('roundPlanHint')}</p>
		<div class="grid gap-4 md:grid-cols-2">
			{#each [left, right] as side, i (i)}
				{@const disp = shown(side)}
				<Card>
					<p class="font-medium">{side.title}</p>
					{#if roundPlan && disp && !disp.feasible}
						<p class="mt-2 text-sm text-warning-text">{t('roundPlanInfeasible')}</p>
					{/if}
					<p class="mt-2 font-mono text-sm">Z = {disp?.Z?.toFixed(4) ?? '—'}</p>
					{#if disp?.x}
						<p class="mt-3 text-xs text-text-soft">План</p>
						<ul class="mt-1 space-y-0.5 font-mono text-xs text-text-muted">
							{#each Object.entries(disp.x) as [k, v] (k)}
								<li>{k}: {v.toFixed(3)}</li>
							{/each}
						</ul>
					{/if}
					{#if disp?.shadow_prices}
						<p class="mt-3 text-xs text-text-soft">Двойственные оценки</p>
						<ul class="mt-1 space-y-0.5 font-mono text-xs text-text-muted">
							{#each Object.entries(disp.shadow_prices) as [k, v] (k)}
								<li>{k}: {v.toFixed(3)}</li>
							{/each}
						</ul>
					{/if}
				</Card>
			{/each}
		</div>
	{/if}

	<div>
		<h2 class="mb-3 text-lg font-medium">Сохранённые</h2>
		{#if saved.length === 0}
			<EmptyState title={t('compareEmpty')} description={t('compareEmptyHint')} />
		{:else}
			<ul class="space-y-2">
				{#each saved as s (s.id)}
					<Card padding={false} class="flex items-center justify-between gap-3 px-4 py-3">
						<button
							type="button"
							class="text-left text-sm text-brand hover:underline"
							onclick={() => reopen(s.node_ids)}
						>
							{nodeTitle(s.node_ids[0])} · {nodeTitle(s.node_ids[1])}
						</button>
						<Button variant="ghost" class="!text-danger-text" onclick={() => hardDelete(s.id)}>
							{t('hardDelete')}
						</Button>
					</Card>
				{/each}
			</ul>
		{/if}
	</div>
</section>
