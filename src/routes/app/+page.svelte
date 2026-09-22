<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import type { Model } from '$lib/domain';
	import { t } from '$lib/i18n';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import GuestWorkspace from '$lib/components/GuestWorkspace.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import ScenarioCardGrid from '$lib/components/ScenarioCardGrid.svelte';
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

	let signedIn = $state(false);
	let authReady = $state(false);
	let recent = $state<Row[]>([]);
	let favorites = $state<Row[]>([]);
	let personal = $state<Row[]>([]);
	let orgPrivate = $state<Row[]>([]);
	let orgFeed = $state<Row[]>([]);

	const listSelect =
		'id, title, updated_at, created_at, is_favorite, org_id, org_visibility, model';

	async function loadCloudLists() {
		const { data } = await supabase
			.from('solve_nodes')
			.select(listSelect)
			.is('parent_id', null)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(40);
		recent = (data ?? []) as Row[];
		favorites = recent.filter((r) => r.is_favorite);
		personal = recent.filter((r) => !r.org_id);
		orgPrivate = recent.filter((r) => r.org_id && r.org_visibility === 'private');
		const { data: feed } = await supabase
			.from('solve_nodes')
			.select(listSelect)
			.eq('org_visibility', 'org')
			.is('parent_id', null)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(20);
		orgFeed = (feed ?? []) as Row[];
	}

	onMount(() => {
		void (async () => {
			const { data } = await supabase.auth.getSession();
			signedIn = !!data.session?.user;
			authReady = true;
			if (signedIn) {
				await loadCloudLists();
			}
		})();

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((_event, session) => {
			signedIn = !!session?.user;
			authReady = true;
			if (signedIn) {
				void loadCloudLists();
			} else {
				recent = [];
				favorites = [];
				personal = [];
				orgPrivate = [];
				orgFeed = [];
			}
		});
		return () => subscription.unsubscribe();
	});
</script>

<section class="mx-auto flex max-w-5xl flex-col gap-8">
	{#if !authReady}
		<p class="text-sm text-text-muted">…</p>
	{:else if !signedIn}
		<PageHeader title={t('home')} description={t('homeGuestHint')} />

		<div class="mx-auto w-full max-w-4xl">
			<GuestWorkspace compact />
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<Button variant="secondary" href="/app/public-templates">{t('publicTemplates')}</Button>
		</div>

		<aside
			class="rounded-[12px] border border-border bg-bg-soft px-6 py-8 text-center sm:px-10"
		>
			<p class="text-lg font-medium tracking-tight text-text">{t('homeLoginUpsellTitle')}</p>
			<p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
				{t('homeLoginUpsellBody')}
			</p>
			<div class="mt-5 flex justify-center">
				<Button href="/login">{t('homeLoginUpsellCta')}</Button>
			</div>
		</aside>
	{:else}
		<PageHeader title={t('home')} description={t('homeHint')} />

		{#if favorites.length}
			<ScenarioCardGrid title={t('favorites')} items={favorites}>
				{#snippet children(r)}
					<TaskPreviewCard
						href="/app/task/{r.id}"
						title={r.title}
						updatedAt={r.updated_at}
						createdAt={r.created_at}
						model={r.model}
						favorite
					/>
				{/snippet}
			</ScenarioCardGrid>
		{/if}

		<ScenarioCardGrid title={t('recent')} items={recent}>
			{#snippet empty()}
				<EmptyState title={t('noScenarios')} description={t('noScenariosHint')}>
					{#snippet action()}
						<Button href="/app/create">{t('newTask')}</Button>
					{/snippet}
				</EmptyState>
			{/snippet}
			{#snippet children(r)}
				<TaskPreviewCard
					href="/app/task/{r.id}"
					title={r.title}
					updatedAt={r.updated_at}
					createdAt={r.created_at}
					model={r.model}
					favorite={r.is_favorite}
				/>
			{/snippet}
		</ScenarioCardGrid>

		<ScenarioCardGrid title={t('personal')} items={personal}>
			{#snippet children(r)}
				<TaskPreviewCard
					href="/app/task/{r.id}"
					title={r.title}
					updatedAt={r.updated_at}
					createdAt={r.created_at}
					model={r.model}
					favorite={r.is_favorite}
				/>
			{/snippet}
		</ScenarioCardGrid>

		<ScenarioCardGrid title={t('orgPrivate')} items={orgPrivate}>
			{#snippet children(r)}
				<TaskPreviewCard
					href="/app/task/{r.id}"
					title={r.title}
					updatedAt={r.updated_at}
					createdAt={r.created_at}
					model={r.model}
					favorite={r.is_favorite}
				/>
			{/snippet}
		</ScenarioCardGrid>

		<ScenarioCardGrid title={t('orgFeed')} items={orgFeed}>
			{#snippet children(r)}
				<TaskPreviewCard
					href="/app/task/{r.id}"
					title={r.title}
					updatedAt={r.updated_at}
					createdAt={r.created_at}
					model={r.model}
					favorite={r.is_favorite}
				/>
			{/snippet}
		</ScenarioCardGrid>
	{/if}
</section>
