<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { t } from '$lib/i18n';

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

<section class="mx-auto max-w-2xl">
	<h1 class="mb-4 text-2xl font-medium">{t('notifications')}</h1>
	<p class="mb-4 text-xs text-text-soft">Обновление раз в 60 с и при фокусе окна.</p>
	<ul class="space-y-2">
		{#each items as n}
			<li class="rounded-[8px] border border-border p-3 {n.read_at ? 'opacity-60' : ''}">
				<p class="font-medium">{n.title}</p>
				{#if n.body}<p class="text-sm text-text-muted">{n.body}</p>{/if}
				{#if !n.read_at}
					<button
						type="button"
						class="mt-2 text-xs text-brand"
						onclick={() => markRead(n.id)}>Прочитано</button
					>
				{/if}
			</li>
		{:else}
			<li class="text-sm text-text-muted">Нет уведомлений</li>
		{/each}
	</ul>
</section>
