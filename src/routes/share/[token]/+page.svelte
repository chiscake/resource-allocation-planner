<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { supabase } from '$lib/db/supabase';

	let title = $state('');
	let z = $state<number | null>(null);
	let error = $state('');

	onMount(async () => {
		const token = page.params.token;
		const { data, error: e1 } = await supabase.rpc('get_shared_node', { p_token: token });
		if (e1 || !data?.length) {
			error = 'Ссылка недоступна';
			return;
		}
		const row = data[0] as { title: string; result: { Z?: number } | null };
		title = row.title ?? 'Сценарий';
		z = row.result?.Z ?? null;
	});
</script>

<main class="grid min-h-screen place-items-center p-8">
	{#if error}
		<p class="text-danger-text">{error}</p>
	{:else}
		<div class="text-center">
			<p class="text-xl font-medium">{title || '…'}</p>
			{#if z != null}
				<p class="mt-2 font-mono text-sm text-text-muted">Z = {z.toFixed(4)}</p>
			{/if}
			<p class="mt-2 text-sm text-text-muted">Публичный просмотр по ссылке</p>
		</div>
	{/if}
</main>
