<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { t } from '$lib/i18n';

	let rows = $state<{ id: string; title: string }[]>([]);

	onMount(async () => {
		const { data } = await supabase
			.from('templates')
			.select('id, title')
			.eq('system_kind', 'public_repo')
			.is('deleted_at', null);
		rows = (data ?? []) as typeof rows;
	});
</script>

<section class="mx-auto max-w-2xl">
	<h1 class="mb-4 text-2xl font-medium">{t('publicTemplates')}</h1>
	<ul class="space-y-2">
		{#each rows as r}
			<li class="flex items-center justify-between rounded-[8px] border border-border px-3 py-2">
				<span>{r.title}</span>
				<a class="text-sm text-brand hover:underline" href="/app/create">Использовать</a>
			</li>
		{:else}
			<li class="text-sm text-text-muted">Каталог пуст</li>
		{/each}
	</ul>
</section>
