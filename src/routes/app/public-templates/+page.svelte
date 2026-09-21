<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { t } from '$lib/i18n';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

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

<section class="mx-auto max-w-2xl space-y-6">
	<PageHeader title={t('publicTemplates')} description="Общедоступные шаблоны для создания сценариев." />

	{#if rows.length === 0}
		<EmptyState title="Каталог пуст" />
	{:else}
		<ul class="space-y-2">
			{#each rows as r}
				<Card padding={false} class="flex items-center justify-between px-4 py-3">
					<span>{r.title}</span>
					<Button variant="ghost" href="/app/create" class="!px-2 !py-1">Использовать</Button>
				</Card>
			{/each}
		</ul>
	{/if}
</section>
