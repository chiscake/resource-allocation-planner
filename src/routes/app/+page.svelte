<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { t } from '$lib/i18n';
	import { editionLabel } from '$lib/platform';

	type Row = {
		id: string;
		title: string;
		updated_at: string;
		is_favorite: boolean;
		org_id: string | null;
		org_visibility: string | null;
	};

	let recent = $state<Row[]>([]);
	let favorites = $state<Row[]>([]);
	let personal = $state<Row[]>([]);
	let orgPrivate = $state<Row[]>([]);
	let orgFeed = $state<Row[]>([]);
	let label = $state('Web версия');
	let userEmail = $state('');

	onMount(async () => {
		label = editionLabel();
		const { data: auth } = await supabase.auth.getUser();
		userEmail = auth.user?.email ?? '';
		const { data } = await supabase
			.from('solve_nodes')
			.select('id, title, updated_at, is_favorite, org_id, org_visibility')
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
			.select('id, title, updated_at, is_favorite, org_id, org_visibility')
			.eq('org_visibility', 'org')
			.is('parent_id', null)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(20);
		orgFeed = (feed ?? []) as Row[];
	});

	async function logout() {
		await supabase.auth.signOut();
		location.href = '/login';
	}
</script>

<section class="mx-auto flex max-w-3xl flex-col gap-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-3xl font-medium tracking-tight">{label}</h1>
			<p class="text-sm text-text-muted">{userEmail || t('home')}</p>
		</div>
		{#if userEmail}
			<button type="button" class="text-sm text-text-muted hover:text-text" onclick={logout}
				>{t('logout')}</button
			>
		{:else}
			<a href="/login" class="text-sm text-brand">{t('login')}</a>
		{/if}
	</div>
	<div class="flex flex-wrap gap-3">
		<a
			href="/app/create"
			class="rounded-[8px] bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-text-medium"
			>{t('create')}</a
		>
		<a href="/app/templates" class="rounded-[8px] border border-border px-4 py-2 text-sm hover:bg-surface"
			>{t('templates')}</a
		>
		<a
			href="/app/public-templates"
			class="rounded-[8px] border border-border px-4 py-2 text-sm hover:bg-surface"
			>{t('publicTemplates')}</a
		>
		<a href="/app/compare" class="rounded-[8px] border border-border px-4 py-2 text-sm hover:bg-surface"
			>{t('compare')}</a
		>
		<a href="/app/trash" class="rounded-[8px] border border-border px-4 py-2 text-sm hover:bg-surface"
			>{t('trash')}</a
		>
		<a href="/app/org" class="rounded-[8px] border border-border px-4 py-2 text-sm hover:bg-surface"
			>{t('org')}</a
		>
		<a href="/app/admin" class="rounded-[8px] border border-border px-4 py-2 text-sm hover:bg-surface"
			>{t('admin')}</a
		>
	</div>

	{#if favorites.length}
		<div>
			<h2 class="mb-2 text-lg font-medium">{t('favorites')}</h2>
			<ul class="space-y-1">
				{#each favorites as r}
					<li>
						<a class="text-brand hover:underline" href="/app/nodes/{r.id}">{r.title}</a>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div>
		<h2 class="mb-2 text-lg font-medium">{t('recent')}</h2>
		{#if recent.length === 0}
			<p class="text-sm text-text-muted">Нет сценариев. Создайте задачу.</p>
		{:else}
			<ul class="space-y-1">
				{#each recent as r}
					<li>
						<a class="text-brand hover:underline" href="/app/nodes/{r.id}">{r.title}</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div>
		<h2 class="mb-2 text-lg font-medium">{t('personal')}</h2>
		<ul class="space-y-1">
			{#each personal as r}
				<li><a class="text-brand hover:underline" href="/app/nodes/{r.id}">{r.title}</a></li>
			{:else}
				<li class="text-sm text-text-muted">—</li>
			{/each}
		</ul>
	</div>

	<div>
		<h2 class="mb-2 text-lg font-medium">{t('orgPrivate')}</h2>
		<ul class="space-y-1">
			{#each orgPrivate as r}
				<li><a class="text-brand hover:underline" href="/app/nodes/{r.id}">{r.title}</a></li>
			{:else}
				<li class="text-sm text-text-muted">—</li>
			{/each}
		</ul>
	</div>

	<div>
		<h2 class="mb-2 text-lg font-medium">{t('orgFeed')}</h2>
		<ul class="space-y-1">
			{#each orgFeed as r}
				<li><a class="text-brand hover:underline" href="/app/nodes/{r.id}">{r.title}</a></li>
			{:else}
				<li class="text-sm text-text-muted">—</li>
			{/each}
		</ul>
	</div>
</section>
