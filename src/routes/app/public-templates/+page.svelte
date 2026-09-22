<script lang="ts">
	import { onMount } from 'svelte';
	import { Pen, Save } from '@lucide/svelte';
	import { supabase } from '$lib/db/supabase';
	import {
		useTemplateAndOpen,
		copyTemplateToAccount,
		copyTemplateAndEdit
	} from '$lib/db/create-solve-node';
	import type { Model } from '$lib/domain';
	import { t } from '$lib/i18n';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CardIconButton from '$lib/components/ui/CardIconButton.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import MatrixThumb from '$lib/components/model/MatrixThumb.svelte';

	type Row = {
		id: string;
		title: string;
		model: Model | null;
	};

	let rows = $state<Row[]>([]);
	let signedIn = $state(false);
	let busyId = $state<string | null>(null);
	let msg = $state('');
	let okMsg = $state('');

	onMount(async () => {
		const { data: auth } = await supabase.auth.getUser();
		signedIn = Boolean(auth.user);
		const { data, error } = await supabase
			.from('templates')
			.select('id, title, model')
			.eq('system_kind', 'public_repo')
			.is('deleted_at', null)
			.order('title');
		if (error) {
			msg = error.message;
			rows = [];
			return;
		}
		rows = (data ?? []) as Row[];
	});

	async function useTemplate(id: string) {
		if (busyId) return;
		busyId = id;
		msg = '';
		okMsg = '';
		const err = await useTemplateAndOpen(id);
		if (err) msg = err.error || t('useFailed');
		busyId = null;
	}

	async function saveTemplate(id: string) {
		if (busyId) return;
		busyId = id;
		msg = '';
		okMsg = '';
		const result = await copyTemplateToAccount(id);
		if ('error' in result) {
			msg = result.error || t('saveTemplateFailed');
		} else {
			okMsg = t('saveTemplateDone');
		}
		busyId = null;
	}

	async function editTemplate(id: string) {
		if (busyId) return;
		busyId = id;
		msg = '';
		okMsg = '';
		const err = await copyTemplateAndEdit(id);
		if (err) msg = err.error || t('saveTemplateFailed');
		busyId = null;
	}
</script>

<section class="mx-auto flex max-w-5xl flex-col gap-6">
	<PageHeader title={t('publicTemplates')} description={t('publicTemplatesHint')} />

	{#if msg}
		<p class="text-sm text-danger-text">{msg}</p>
	{/if}
	{#if okMsg}
		<p class="text-sm text-text-muted">{okMsg}</p>
	{/if}

	{#if rows.length === 0}
		<EmptyState title={t('catalogEmpty')} />
	{:else}
		<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each rows as r (r.id)}
				<li
					class="flex flex-col overflow-hidden rounded-[12px] border border-border bg-bg"
				>
					<MatrixThumb model={r.model} class="rounded-none border-0 border-b border-border" />
					<div class="flex flex-1 flex-col gap-3 px-3 py-3">
						<span class="line-clamp-2 text-sm font-medium text-text">{r.title}</span>
						<div class="mt-auto flex flex-wrap items-center gap-2">
							<Button
								variant="primary"
								class="!px-3 !py-1.5"
								disabled={busyId === r.id}
								onclick={() => useTemplate(r.id)}
							>
								{busyId === r.id ? t('creatingTask') : t('useTemplate')}
							</Button>
							{#if signedIn}
								<div class="ml-auto flex gap-2">
									<CardIconButton
										disabled={busyId === r.id}
										aria-label={t('saveTemplate')}
										title={t('saveTemplate')}
										onclick={() => saveTemplate(r.id)}
									>
										<Save size={18} strokeWidth={1.75} aria-hidden="true" />
									</CardIconButton>
									<CardIconButton
										disabled={busyId === r.id}
										aria-label={t('editTemplate')}
										title={t('editTemplate')}
										onclick={() => editTemplate(r.id)}
									>
										<Pen size={18} strokeWidth={1.75} aria-hidden="true" />
									</CardIconButton>
								</div>
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
