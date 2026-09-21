<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { t } from '$lib/i18n';
	import Button from '$lib/components/ui/Button.svelte';

	let rows = $state<{ id: string; title: string }[]>([]);

	onMount(async () => {
		const { data: auth } = await supabase.auth.getUser();
		if (!auth.user) {
			rows = [];
			return;
		}
		const { data } = await supabase
			.from('templates')
			.select('id, title')
			.is('deleted_at', null)
			.is('system_kind', null)
			.eq('owner_id', auth.user.id);
		rows = (data ?? []) as typeof rows;
	});
</script>

<section class="mx-auto max-w-2xl">
	<h1 class="mb-4 text-2xl font-medium">{t('templates')}</h1>
	<ul class="space-y-2">
		{#each rows as r}
			<li class="flex items-center justify-between rounded-[8px] border border-border px-3 py-2">
				<span>{r.title}</span>
				<Button variant="ghost" href="/app/create" class="!px-2 !py-1">Использовать</Button>
			</li>
		{:else}
			<li class="text-sm text-text-muted">Нет личных шаблонов</li>
		{/each}
	</ul>
</section>
