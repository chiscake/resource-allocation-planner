<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { writeAudit } from '$lib/db/audit';
	import { t } from '$lib/i18n';

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
		const patch: Record<string, unknown> = {
			deleted_at: null,
			deleted_by_org_owner: false
		};
		if (row.org_id) {
			patch.org_visibility = 'private';
		} else {
			patch.org_visibility = null;
		}
		await supabase.from('solve_nodes').update(patch).eq('id', row.id);
		await writeAudit({
			action: 'restore',
			entity_type: 'solve_node',
			entity_id: row.id,
			org_id: row.org_id
		});
		await load();
	}

	async function hardDelete(id: string) {
		await supabase.from('solve_nodes').delete().eq('id', id);
		await writeAudit({ action: 'hard_delete', entity_type: 'solve_node', entity_id: id });
		await load();
	}
</script>

<section class="mx-auto max-w-2xl space-y-8">
	<div>
		<h1 class="mb-4 text-2xl font-medium">{t('trash')}</h1>
		<ul class="space-y-2">
			{#each mine as r}
				<li class="flex items-center justify-between gap-3 rounded-[8px] border border-border p-3">
					<div>
						<p>{r.title}</p>
						{#if r.deleted_by_org_owner}
							<p class="text-xs text-warning-text">Удалено организацией</p>
						{/if}
					</div>
					<div class="flex gap-2">
						<button type="button" class="text-sm text-brand" onclick={() => restore(r)}
							>Восстановить</button
						>
						<button
							type="button"
							class="text-sm text-danger-text"
							onclick={() => hardDelete(r.id)}>{t('hardDelete')}</button
						>
					</div>
				</li>
			{:else}
				<li class="text-sm text-text-muted">Корзина пуста</li>
			{/each}
		</ul>
	</div>

	{#if isOrgOwner}
		<div>
			<h2 class="mb-3 text-lg font-medium">Корзина организации</h2>
			<p class="mb-3 text-xs text-text-soft">
				С ленты: скрыть чужой org-сценарий (soft-delete + уведомление владельцу).
			</p>
			<ul class="space-y-2">
				{#each orgTrash as r}
					<li class="flex justify-between rounded-[8px] border border-border p-3 text-sm">
						<span>{r.title}</span>
						<span class="text-text-muted">уже удалено org</span>
					</li>
				{:else}
					<li class="text-sm text-text-muted">Нет записей</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>
