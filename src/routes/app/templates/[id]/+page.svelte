<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/db/supabase';
	import type { Model } from '$lib/domain';
	import { t } from '$lib/i18n';
	import LpModelMatrix from '$lib/components/model/LpModelMatrix.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';

	let title = $state('');
	let model = $state<Model | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let msg = $state('');
	let err = $state('');
	let loadedId = $state('');

	const templateId = $derived(page.params.id ?? '');

	$effect(() => {
		const id = templateId;
		if (!id || id === loadedId) return;
		void loadTemplate(id);
	});

	async function loadTemplate(id: string) {
		loading = true;
		err = '';
		msg = '';
		model = null;
		const { data: auth } = await supabase.auth.getUser();
		if (!auth.user) {
			void goto('/login');
			return;
		}
		const { data, error } = await supabase
			.from('templates')
			.select('id, title, model, owner_id, system_kind')
			.eq('id', id)
			.is('deleted_at', null)
			.single();
		if (error || !data) {
			err = error?.message ?? t('notFound');
			loadedId = id;
			loading = false;
			return;
		}
		if (data.owner_id !== auth.user.id || data.system_kind != null) {
			err = t('notFound');
			loadedId = id;
			loading = false;
			return;
		}
		title = data.title as string;
		model = structuredClone(data.model as Model);
		loadedId = id;
		loading = false;
	}

	function onModelChange(next: Model) {
		model = next;
		msg = '';
	}

	async function save() {
		if (!model || saving) return;
		saving = true;
		err = '';
		msg = '';
		const { error } = await supabase
			.from('templates')
			.update({
				title: title.trim() || t('templates'),
				model,
				updated_at: new Date().toISOString()
			})
			.eq('id', templateId);
		if (error) {
			err = error.message;
		} else {
			msg = t('templateSaved');
		}
		saving = false;
	}
</script>

<section class="mx-auto flex max-w-4xl flex-col gap-6">
	{#if loading}
		<p class="text-sm text-text-muted">…</p>
	{:else if !model}
		<p class="text-danger-text">{err || t('notFound')}</p>
		<Button variant="secondary" href="/app/templates">{t('templates')}</Button>
	{:else}
		<PageHeader title={t('editTemplateTitle')}>
			{#snippet actions()}
				<Button variant="secondary" href="/app/templates">{t('templates')}</Button>
				<Button disabled={saving} onclick={save}>
					{saving ? t('saving') : t('save')}
				</Button>
			{/snippet}
		</PageHeader>

		{#if err}
			<p class="rounded-[8px] bg-danger-bg px-3 py-2 text-sm text-danger-text">{err}</p>
		{/if}
		{#if msg}
			<p class="text-sm text-text-muted">{msg}</p>
		{/if}

		<label class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-text">{t('templateTitle')}</span>
			<Input bind:value={title} />
		</label>

		<Card>
			<p class="mb-2 text-sm font-medium">{t('modelMatrix')}</p>
			<LpModelMatrix {model} onchange={onModelChange} />
		</Card>
	{/if}
</section>
