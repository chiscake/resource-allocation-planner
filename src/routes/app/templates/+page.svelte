<script lang="ts">
	import { onMount } from 'svelte';
	import { Pen, Trash2 } from '@lucide/svelte';
	import { supabase } from '$lib/db/supabase';
	import { useTemplateAndOpen } from '$lib/db/create-solve-node';
	import { softDeleteTemplate, restoreTemplate } from '$lib/db/soft-delete';
	import type { Model } from '$lib/domain';
	import { t } from '$lib/i18n';
	import { optimisticDeleteWithUndo } from '$lib/ui/optimistic-delete';
	import TemplatePreviewCard from '$lib/components/TemplatePreviewCard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CardIconButton from '$lib/components/ui/CardIconButton.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import InlineAlert from '$lib/components/ui/InlineAlert.svelte';

	type Row = {
		id: string;
		title: string;
		model: Model | null;
		updated_at: string | null;
	};

	let rows = $state<Row[]>([]);
	let busyId = $state<string | null>(null);
	let msg = $state('');

	function sortByTitle(list: Row[]) {
		return [...list].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
	}

	onMount(async () => {
		const { data: auth } = await supabase.auth.getUser();
		if (!auth.user) {
			rows = [];
			return;
		}
		const { data } = await supabase
			.from('templates')
			.select('id, title, model, updated_at')
			.is('deleted_at', null)
			.is('system_kind', null)
			.eq('owner_id', auth.user.id)
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

	async function deleteTemplate(row: Row) {
		if (busyId) return;
		busyId = row.id;
		msg = '';
		await optimisticDeleteWithUndo({
			item: row,
			removeOptimistic: () => {
				rows = rows.filter((r) => r.id !== row.id);
			},
			restoreOptimistic: (removed) => {
				rows = sortByTitle([...rows, removed]);
			},
			softDelete: () => softDeleteTemplate(row.id),
			restore: () => restoreTemplate(row.id)
		});
		busyId = null;
	}
</script>

<section class="mx-auto flex max-w-5xl flex-col gap-6">
	<PageHeader title={t('templates')} />

	{#if msg}
		<InlineAlert>{msg}</InlineAlert>
	{/if}

	{#if rows.length === 0}
		<EmptyState title={t('noPersonalTemplates')} />
	{:else}
		<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each rows as r (r.id)}
				<li>
					<TemplatePreviewCard title={r.title} model={r.model}>
						{#snippet actions()}
							<Button
								variant="primary"
								class="!px-3 !py-1.5"
								disabled={busyId === r.id}
								onclick={() => useTemplate(r.id)}
							>
								{busyId === r.id ? t('creatingTask') : t('useTemplate')}
							</Button>
							<div class="ml-auto flex gap-2">
								<CardIconButton
									href="/app/templates/{r.id}"
									aria-label={t('editTemplate')}
									title={t('editTemplate')}
								>
									<Pen size={18} strokeWidth={1.75} aria-hidden="true" />
								</CardIconButton>
								<CardIconButton
									tone="danger"
									disabled={busyId === r.id}
									aria-label={t('deleteCard')}
									title={t('deleteCard')}
									onclick={() => deleteTemplate(r)}
								>
									<Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
								</CardIconButton>
							</div>
						{/snippet}
					</TemplatePreviewCard>
				</li>
			{/each}
		</ul>
	{/if}
</section>
