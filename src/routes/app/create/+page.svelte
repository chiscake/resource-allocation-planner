<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { createBlankModel, createTask13Model, type Model } from '$lib/domain';
	import { t } from '$lib/i18n';

	let templates = $state<{ id: string; title: string; model: Model }[]>([]);
	let msg = $state('');

	onMount(async () => {
		const { data: auth } = await supabase.auth.getUser();
		const { data } = await supabase
			.from('templates')
			.select('id, title, model, system_kind, owner_id')
			.is('deleted_at', null)
			.order('title');
		const rows = (data ?? []) as {
			id: string;
			title: string;
			model: Model;
			system_kind: string | null;
			owner_id: string | null;
		}[];
		const seen = new Set<string>();
		templates = [];
		for (const r of rows) {
			const key = `${r.system_kind ?? 'personal'}:${r.title}`;
			if (seen.has(key)) continue;
			if (r.system_kind === 'signup_seed' && r.owner_id && r.owner_id !== auth.user?.id) continue;
			seen.add(key);
			templates.push({ id: r.id, title: r.title, model: r.model });
		}
	});

	async function createFrom(model: Model, title: string) {
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) {
			void goto('/login');
			return;
		}
		const snapshot = structuredClone(model);
		if (snapshot.what_if_defaults == null && 'what_if' in model === false) {
			/* keep */
		}
		const { data, error } = await supabase
			.from('solve_nodes')
			.insert({
				owner_id: user.id,
				title,
				kind: 'root',
				model: snapshot
			})
			.select('id')
			.single();
		if (error) {
			msg = error.message;
			return;
		}
		void goto(`/app/nodes/${data.id}`);
	}
</script>

<section class="mx-auto flex max-w-2xl flex-col gap-4">
	<h1 class="text-2xl font-medium">{t('create')}</h1>
	{#if msg}<p class="text-danger-text">{msg}</p>{/if}
	<button
		type="button"
		class="rounded-[8px] border border-border px-4 py-3 text-left hover:bg-surface"
		onclick={() => createFrom(createBlankModel(), 'Новая задача')}
	>
		Пустая задача
	</button>
	<button
		type="button"
		class="rounded-[8px] border border-border px-4 py-3 text-left hover:bg-surface"
		onclick={() => createFrom(createTask13Model(), 'Задача 13')}
	>
		Задача 13 (локальный шаблон)
	</button>
	{#each templates as tpl}
		<button
			type="button"
			class="rounded-[8px] border border-border px-4 py-3 text-left hover:bg-surface"
			onclick={() =>
				createFrom(
					{ ...tpl.model, what_if_defaults: tpl.model.what_if_defaults },
					tpl.title
				)}
		>
			{tpl.title}
		</button>
	{/each}
</section>
