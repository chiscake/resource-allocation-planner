<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { writeAudit } from '$lib/db/audit';
	import { restoreSolveNode } from '$lib/db/soft-delete';
	import { t } from '$lib/i18n';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	type Row = {
		id: string;
		title: string;
		deleted_at: string;
		deleted_by_org_owner: boolean;
		org_id: string | null;
		org_visibility: string | null;
	};

	let mine = $state<Row[]>([]);
	let orgTrash = $state<Row[]>([]);
	let isOrgOwner = $state(false);

	async function load() {
		const { data } = await supabase
			.from('solve_nodes')
			.select('id, title, deleted_at, deleted_by_org_owner, org_id, org_visibility')
			.is('parent_id', null)
			.not('deleted_at', 'is', null)
			.order('deleted_at', { ascending: false });
		mine = (data ?? []) as Row[];

		const { data: memberships } = await supabase
			.from('organization_members')
			.select('org_id, role')
			.eq('role', 'org_owner');
		isOrgOwner = (memberships ?? []).length > 0;
		const orgIds = (memberships ?? []).map((m) => m.org_id as string);
		if (orgIds.length) {
			const { data: ot } = await supabase
				.from('solve_nodes')
				.select('id, title, deleted_at, deleted_by_org_owner, org_id, org_visibility')
				.in('org_id', orgIds)
				.is('parent_id', null)
				.not('deleted_at', 'is', null)
				.eq('deleted_by_org_owner', true);
			orgTrash = (ot ?? []) as Row[];
		} else {
			orgTrash = [];
		}
	}

	onMount(() => {
		void load();
	});

	async function restore(row: Row) {
		await restoreSolveNode({ id: row.id, org_id: row.org_id });
		await load();
	}

	async function hardDelete(id: string) {
		await supabase.from('solve_nodes').delete().eq('id', id);
		await writeAudit({ action: 'hard_delete', entity_type: 'solve_node', entity_id: id });
		await load();
	}
</script>

<section class="mx-auto max-w-2xl space-y-8">
	<PageHeader title={t('trash')} description={t('trashHint')} />

	<div>
		{#if mine.length === 0}
			<EmptyState title={t('trashEmpty')} description={t('trashEmptyHint')} />
		{:else}
			<ul class="space-y-2">
				{#each mine as r}
					<Card padding={false} class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
						<div>
							<p class="font-medium">{r.title}</p>
							{#if r.deleted_by_org_owner}
								<p class="text-xs text-warning-text">{t('deletedByOrg')}</p>
							{/if}
						</div>
						<div class="flex gap-2">
							<Button variant="ghost" onclick={() => restore(r)}>{t('restore')}</Button>
							<Button variant="ghost" class="!text-danger-text" onclick={() => hardDelete(r.id)}>
								{t('hardDelete')}
							</Button>
						</div>
					</Card>
				{/each}
			</ul>
		{/if}
	</div>

	{#if isOrgOwner}
		<div>
			<h2 class="mb-2 text-lg font-medium">{t('trashOrgTitle')}</h2>
			<p class="mb-3 text-xs text-text-soft">{t('trashOrgHint')}</p>
			{#if orgTrash.length === 0}
				<EmptyState title={t('trashOrgEmpty')} />
			{:else}
				<ul class="space-y-2">
					{#each orgTrash as r}
						<Card padding={false} class="flex items-center justify-between px-4 py-3 text-sm">
							<span>{r.title}</span>
							<span class="text-text-muted">{t('trashOrgAlreadyGone')}</span>
						</Card>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>
