<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { writeAudit } from '$lib/db/audit';
	import { t } from '$lib/i18n';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	let orgs = $state<{ id: string; name: string }[]>([]);
	let feed = $state<{ id: string; title: string; owner_id: string; org_id: string | null }[]>([]);
	let isOrgOwner = $state(false);
	let myId = $state('');

	async function load() {
		const { data: auth } = await supabase.auth.getUser();
		myId = auth.user?.id ?? '';
		const { data: memberships } = await supabase
			.from('organization_members')
			.select('org_id, role, organizations(id, name)')
			.eq('user_id', myId);
		type OrgJoin = { id: string; name: string } | { id: string; name: string }[] | null;
		const rows = (memberships ?? []) as {
			org_id: string;
			role: string;
			organizations: OrgJoin;
		}[];
		orgs = rows
			.map((m) => {
				const raw = m.organizations;
				if (!raw) return null;
				const org = Array.isArray(raw) ? raw[0] : raw;
				return org ?? null;
			})
			.filter((o): o is { id: string; name: string } => o != null);
		isOrgOwner = rows.some((m) => m.role === 'org_owner');
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

	async function hideAsOrgOwner(row: {
		id: string;
		title: string;
		owner_id: string;
		org_id: string | null;
	}) {
		await supabase.from('solve_nodes').update({ org_visibility: 'private' }).eq('id', row.id);
		await supabase
			.from('solve_nodes')
			.update({ org_visibility: 'private' })
			.eq('parent_id', row.id)
			.is('deleted_at', null);
		await supabase.rpc('notify_user', {
			p_user_id: row.owner_id,
			p_type: 'org_owner_hidden_node',
			p_title: 'Организация скрыла сценарий',
			p_body: row.title,
			p_entity_type: 'solve_node',
			p_entity_id: row.id
		});
		await writeAudit({
			action: 'visibility_change',
			entity_type: 'solve_node',
			entity_id: row.id,
			org_id: row.org_id,
			target_user_id: row.owner_id,
			visibility_from: 'org',
			visibility_to: 'private'
		});
		await load();
	}
</script>

<section class="mx-auto max-w-2xl space-y-6">
	<PageHeader title={t('org')} description={t('orgHint')} />

	<div>
		<h2 class="mb-3 text-lg font-medium">{t('orgMyTitle')}</h2>
		{#if orgs.length === 0}
			<EmptyState title={t('orgNone')} description={t('orgNoneHint')} />
		{:else}
			<ul class="space-y-2">
				{#each orgs as o}
					<Card padding={false} class="px-4 py-3 text-sm font-medium">
						{o.name}
					</Card>
				{/each}
			</ul>
		{/if}
	</div>

	<div>
		<h2 class="mb-3 text-lg font-medium">{t('orgFeed')}</h2>
		{#if feed.length === 0}
			<EmptyState title={t('orgFeedEmpty')} description={t('orgFeedEmptyHint')} />
		{:else}
			<ul class="space-y-2">
				{#each feed as n}
					<Card padding={false} class="flex items-center justify-between gap-2 px-4 py-3">
						<a class="text-brand hover:underline" href="/app/task/{n.id}">{n.title}</a>
						{#if isOrgOwner && n.owner_id !== myId}
							<Button variant="ghost" class="!text-danger-text" onclick={() => hideAsOrgOwner(n)}>
								{t('hide')}
							</Button>
						{/if}
					</Card>
				{/each}
			</ul>
		{/if}
	</div>
</section>
