<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { writeAudit } from '$lib/db/audit';
	import { t } from '$lib/i18n';

	let orgs = $state<{ id: string; name: string }[]>([]);
	let feed = $state<{ id: string; title: string; owner_id: string; org_id: string | null }[]>([]);
	let isOrgOwner = $state(false);
	let myId = $state('');

	async function load() {
		const { data: auth } = await supabase.auth.getUser();
		myId = auth.user?.id ?? '';
		const { data: o } = await supabase.from('organizations').select('id, name');
		orgs = (o ?? []) as typeof orgs;
		const { data: mem } = await supabase
			.from('organization_members')
			.select('role')
			.eq('role', 'org_owner');
		isOrgOwner = (mem ?? []).length > 0;
		const { data: f } = await supabase
			.from('solve_nodes')
			.select('id, title, owner_id, org_id')
			.eq('org_visibility', 'org')
			.is('parent_id', null)
			.is('deleted_at', null);
		feed = (f ?? []) as typeof feed;
	}

	onMount(() => {
		void load();
	});

	async function hideAsOrgOwner(row: { id: string; title: string; owner_id: string; org_id: string | null }) {
		const now = new Date().toISOString();
		await supabase
			.from('solve_nodes')
			.update({ deleted_at: now, deleted_by_org_owner: true })
			.eq('id', row.id);
		await supabase.rpc('notify_user', {
			p_user_id: row.owner_id,
			p_type: 'org_owner_deleted_node',
			p_title: 'Организация удалила сценарий',
			p_body: row.title,
			p_entity_type: 'solve_node',
			p_entity_id: row.id
		});
		await writeAudit({
			action: 'org_owner_delete',
			entity_type: 'solve_node',
			entity_id: row.id,
			org_id: row.org_id,
			target_user_id: row.owner_id
		});
		await load();
	}
</script>

<section class="mx-auto max-w-2xl space-y-4">
	<h1 class="text-2xl font-medium">{t('org')}</h1>
	<ul class="space-y-1">
		{#each orgs as o}
			<li class="font-mono text-sm">{o.name} — {o.id}</li>
		{:else}
			<li class="text-sm text-text-muted">Нет организаций (запустите pnpm seed:users)</li>
		{/each}
	</ul>
	<h2 class="text-lg font-medium">Лента org</h2>
	<ul class="space-y-2">
		{#each feed as n}
			<li class="flex items-center justify-between gap-2 rounded-[8px] border border-border px-3 py-2">
				<a class="text-brand hover:underline" href="/app/nodes/{n.id}">{n.title}</a>
				{#if isOrgOwner && n.owner_id !== myId}
					<button
						type="button"
						class="text-xs text-danger-text"
						onclick={() => hideAsOrgOwner(n)}>Скрыть</button
					>
				{/if}
			</li>
		{:else}
			<li class="text-sm text-text-muted">Пусто</li>
		{/each}
	</ul>
</section>
