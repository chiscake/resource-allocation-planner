<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { t } from '$lib/i18n';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	type N = {
		id: string;
		title: string;
		type: string;
		body: string | null;
		read_at: string | null;
		created_at: string;
	};

	let items = $state<N[]>([]);

	async function load() {
		const { data } = await supabase
			.from('notifications')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(50);
		items = (data ?? []) as N[];
	}

	onMount(() => {
		void load();
		const tmr = setInterval(() => void load(), 60_000);
		const onFocus = () => void load();
		window.addEventListener('focus', onFocus);
		return () => {
			clearInterval(tmr);
			window.removeEventListener('focus', onFocus);
		};
	});

	async function markRead(id: string) {
		await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
		await load();
	}
</script>

<section class="mx-auto max-w-2xl space-y-6">
	<PageHeader
		title={t('notifications')}
		description="Обновление раз в 60 с и при фокусе окна."
	/>

	{#if items.length === 0}
		<EmptyState title="Нет уведомлений" />
	{:else}
		<ul class="space-y-2">
			{#each items as n}
				<Card class={n.read_at ? 'opacity-60' : ''}>
					<p class="font-medium">{n.title}</p>
					{#if n.body}<p class="mt-1 text-sm text-text-muted">{n.body}</p>{/if}
					{#if !n.read_at}
						<Button variant="ghost" class="mt-2 !px-0" onclick={() => markRead(n.id)}>
							Прочитано
						</Button>
					{/if}
				</Card>
			{/each}
		</ul>
	{/if}
</section>
