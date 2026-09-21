<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { supabase } from '$lib/db/supabase';
	import type { SolveResult } from '$lib/domain';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	let title = $state('');
	let result = $state<SolveResult | null>(null);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		const token = page.params.token;
		const { data, error: e1 } = await supabase.rpc('get_shared_node', { p_token: token });
		loading = false;
		if (e1 || !data?.length) {
			error = 'Ссылка недоступна';
			return;
		}
		const row = data[0] as { title: string; result: SolveResult | null };
		title = row.title ?? 'Сценарий';
		result = row.result;
	});
</script>

<main class="grid min-h-screen place-items-center p-8">
	{#if loading}
		<p class="text-sm text-text-muted">Загрузка…</p>
	{:else if error}
		<EmptyState title={error} description="Ссылка отозвана или истекла." class="max-w-md" />
	{:else}
		<Card class="w-full max-w-lg text-center">
			<p class="text-xl font-medium">{title}</p>
			{#if result?.Z != null}
				<p class="mt-3 font-mono text-sm text-text-muted">Z = {result.Z.toFixed(4)}</p>
			{/if}
			{#if result?.x && Object.keys(result.x).length > 0}
				<div class="mt-4 text-left">
					<p class="text-xs text-text-soft">План</p>
					<ul class="mt-1 space-y-0.5 font-mono text-xs text-text-muted">
						{#each Object.entries(result.x) as [k, v] (k)}
							<li>{k}: {v.toFixed(3)}</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if result?.shadow_prices && Object.keys(result.shadow_prices).length > 0}
				<div class="mt-4 text-left">
					<p class="text-xs text-text-soft">Двойственные оценки</p>
					<ul class="mt-1 space-y-0.5 font-mono text-xs text-text-muted">
						{#each Object.entries(result.shadow_prices) as [k, v] (k)}
							<li>{k}: {v.toFixed(3)}</li>
						{/each}
					</ul>
				</div>
			{/if}
			<p class="mt-6 text-sm text-text-muted">Публичный просмотр по ссылке</p>
		</Card>
	{/if}
</main>
