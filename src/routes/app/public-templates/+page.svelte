<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { useTemplateAndOpen } from '$lib/db/create-solve-node';
	import type { Model } from '$lib/domain';
	import { t } from '$lib/i18n';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import MatrixThumb from '$lib/components/model/MatrixThumb.svelte';

	type Row = {
		id: string;
		title: string;
		model: Model | null;
	};

	let rows = $state<Row[]>([]);
	let busyId = $state<string | null>(null);
	let msg = $state('');

	onMount(async () => {
		const { data } = await supabase
			.from('templates')
			.select('id, title, model')
			.eq('system_kind', 'public_repo')
			.is('deleted_at', null)
			.order('title');
		rows = (data ?? []) as Row[];
	});

	async function useTemplate(id: string) {
		if (busyId) return;
		busyId = id;
		msg = '';
		const err = await useTemplateAndOpen(id);
		if (err) msg = err.error || t('useFailed');
		busyId = null;
	}
</script>

<section class="mx-auto flex max-w-5xl flex-col gap-6">
	<PageHeader
		title={t('publicTemplates')}
		description="Общедоступные шаблоны для создания сценариев."
	/>

	{#if msg}
		<p class="text-sm text-danger-text">{msg}</p>
	{/if}

	{#if rows.length === 0}
		<EmptyState title="Каталог пуст" />
	{:else}
		<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each rows as r (r.id)}
				<li
					class="flex flex-col overflow-hidden rounded-[12px] border border-border bg-bg"
				>
					<MatrixThumb model={r.model} class="rounded-none border-0 border-b border-border" />
					<div class="flex flex-1 flex-col gap-3 px-3 py-3">
						<span class="line-clamp-2 text-sm font-medium text-text">{r.title}</span>
						<div class="mt-auto">
							<Button
								variant="primary"
								class="!px-3 !py-1.5"
								disabled={busyId === r.id}
								onclick={() => useTemplate(r.id)}
							>
								{busyId === r.id ? t('creatingTask') : t('useTemplate')}
							</Button>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
