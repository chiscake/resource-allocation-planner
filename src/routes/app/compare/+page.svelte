<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { t } from '$lib/i18n';
	import type { SolveResult } from '$lib/domain';

	type NodeView = { title: string; result: SolveResult | null };

	let a = $state('');
	let b = $state('');
	let left = $state<NodeView | null>(null);
	let right = $state<NodeView | null>(null);
	let nodes = $state<{ id: string; title: string }[]>([]);
	let saved = $state<{ id: string; node_ids: string[] }[]>([]);

	async function loadSaved() {
		const { data } = await supabase
			.from('comparisons')
			.select('id, node_ids')
			.order('created_at', { ascending: false })
			.limit(20);
		saved = (data ?? []) as typeof saved;
	}

	onMount(async () => {
		const { data } = await supabase
			.from('solve_nodes')
			.select('id, title')
			.is('parent_id', null)
			.is('deleted_at', null);
		nodes = (data ?? []) as typeof nodes;
		await loadSaved();
	});

	async function run() {
		const { data: d1 } = await supabase.from('solve_nodes').select('title, result').eq('id', a).single();
		const { data: d2 } = await supabase.from('solve_nodes').select('title, result').eq('id', b).single();
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
</script>

<section class="mx-auto max-w-4xl space-y-4">
	<h1 class="text-2xl font-medium">{t('compare')}</h1>
	<div class="flex flex-wrap gap-3">
		<select class="rounded-[8px] border border-border px-3 py-2" bind:value={a}>
			<option value="">A</option>
			{#each nodes as n}<option value={n.id}>{n.title}</option>{/each}
		</select>
		<select class="rounded-[8px] border border-border px-3 py-2" bind:value={b}>
			<option value="">B</option>
			{#each nodes as n}<option value={n.id}>{n.title}</option>{/each}
		</select>
		<button type="button" class="rounded-[8px] bg-accent px-4 py-2 text-sm text-white" onclick={run}
			>Сравнить</button
		>
	</div>
	{#if left && right}
		<div class="grid gap-4 md:grid-cols-2">
			{#each [left, right] as side}
				<div class="rounded-[12px] border border-border p-4">
					<p class="font-medium">{side.title}</p>
					<p class="font-mono">Z = {side.result?.Z?.toFixed(4) ?? '—'}</p>
					{#if side.result?.x}
						<ul class="mt-2 space-y-0.5 font-mono text-xs text-text-muted">
							{#each Object.entries(side.result.x) as [k, v]}
								<li>{k}: {v.toFixed(3)}</li>
							{/each}
						</ul>
					{/if}
					{#if side.result?.shadow_prices}
						<p class="mt-2 text-xs text-text-soft">Duals</p>
						<ul class="space-y-0.5 font-mono text-xs text-text-muted">
							{#each Object.entries(side.result.shadow_prices) as [k, v]}
								<li>{k}: {v.toFixed(3)}</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<div>
		<h2 class="mb-2 text-lg font-medium">Сохранённые</h2>
		<ul class="space-y-2">
			{#each saved as s}
				<li class="flex items-center justify-between rounded-[8px] border border-border px-3 py-2 text-sm">
					<button type="button" class="text-brand hover:underline" onclick={() => reopen(s.node_ids)}
						>{s.node_ids.join(' · ')}</button
					>
					<button
						type="button"
						class="text-danger-text"
						onclick={() => hardDelete(s.id)}>{t('hardDelete')}</button
					>
				</li>
			{:else}
				<li class="text-sm text-text-muted">Нет сравнений</li>
			{/each}
		</ul>
	</div>
</section>
