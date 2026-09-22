<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/db/supabase';
	import { softDeleteSolveNode, restoreSolveNode } from '$lib/db/soft-delete';
	import type { Model } from '$lib/domain';
	import { t } from '$lib/i18n';
	import { toastDeletedWithUndo } from '$lib/ui/toast-undo';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import TaskPreviewCard from '$lib/components/TaskPreviewCard.svelte';

	type Row = {
		id: string;
		title: string;
		updated_at: string;
		created_at?: string;
		is_favorite: boolean;
		org_id: string | null;
		org_visibility: string | null;
		model: Model | null;
	};

	let rows = $state<Row[]>([]);
	let query = $state('');
	let msg = $state('');
	let loading = $state(true);

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const list = q
			? rows.filter((r) => r.title.toLowerCase().includes(q))
			: rows;
		return [...list].sort(
			(a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
		);
	});

	async function load() {
		loading = true;
		msg = '';
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) {
			rows = [];
			msg = t('noSession');
			loading = false;
			return;
		}
		const { data, error } = await supabase
			.from('solve_nodes')
			.select(
				'id, title, updated_at, created_at, is_favorite, org_id, org_visibility, model'
			)
			.eq('owner_id', user.id)
			.is('parent_id', null)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false });
		if (error) {
			msg = error.message;
			rows = [];
		} else {
			rows = (data ?? []) as Row[];
		}
		loading = false;
	}

	async function deleteCard(row: Row) {
		const snapshot = { ...row };
		rows = rows.filter((r) => r.id !== row.id);
		const result = await softDeleteSolveNode({ id: row.id, org_id: row.org_id });
		if (result.error) {
			rows = [...rows, snapshot].sort(
				(a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
			);
			toast.error(result.error || t('deleteFailed'));
			return;
		}
		toastDeletedWithUndo(async () => {
			const restored = await restoreSolveNode({ id: snapshot.id, org_id: snapshot.org_id });
			if (restored.error) {
				toast.error(restored.error || t('restoreFailed'));
				return;
			}
			const restoredRow: Row = {
				...snapshot,
				org_visibility: snapshot.org_id ? 'private' : null
			};
			rows = [restoredRow, ...rows.filter((r) => r.id !== restoredRow.id)].sort(
				(a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
			);
		});
	}

	onMount(() => {
		void load();
	});
</script>

<section class="mx-auto flex max-w-5xl flex-col gap-6">
	<PageHeader title={t('myTasks')} description={t('myTasksHint')} />

	<label class="block max-w-md">
		<span class="mb-1 block text-sm text-text-muted">{t('searchByName')}</span>
		<Input
			type="search"
			bind:value={query}
			placeholder={t('searchByNamePlaceholder')}
		/>
	</label>

	{#if msg}
		<p class="text-sm text-danger-text">{msg}</p>
	{/if}

	{#if loading}
		<p class="text-sm text-text-muted">…</p>
	{:else if filtered.length === 0}
		<EmptyState title={t('noScenarios')} description={t('noScenariosHint')}>
			{#snippet action()}
				<Button href="/app/create">{t('newTask')}</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each filtered as r (r.id)}
				<li>
					<TaskPreviewCard
						href="/app/task/{r.id}"
						title={r.title}
						updatedAt={r.updated_at}
						createdAt={r.created_at}
						model={r.model}
						favorite={r.is_favorite}
						onDelete={() => deleteCard(r)}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</section>
