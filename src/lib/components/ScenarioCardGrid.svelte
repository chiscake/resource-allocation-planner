<script lang="ts" generics="T extends { id: string }">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		title,
		items,
		/** Cap visible cards; omit for full list (e.g. /app/tasks). */
		limit = null as number | null,
		/** Disable internal «Показать больше» expand. */
		disableExpand = false,
		headerActions,
		empty,
		children
	}: {
		title: string;
		items: T[];
		limit?: number | null;
		disableExpand?: boolean;
		headerActions?: Snippet;
		empty?: Snippet;
		children: Snippet<[T]>;
	} = $props();

	let expanded = $state(false);
	let columns = $state(1);

	onMount(() => {
		const update = () => {
			if (window.matchMedia('(min-width: 1024px)').matches) columns = 3;
			else if (window.matchMedia('(min-width: 640px)').matches) columns = 2;
			else columns = 1;
		};
		update();
		const mqlSm = window.matchMedia('(min-width: 640px)');
		const mqlLg = window.matchMedia('(min-width: 1024px)');
		mqlSm.addEventListener('change', update);
		mqlLg.addEventListener('change', update);
		return () => {
			mqlSm.removeEventListener('change', update);
			mqlLg.removeEventListener('change', update);
		};
	});

	const rowLimit = $derived(limit != null ? limit : columns * 2);
	const needsToggle = $derived(
		!disableExpand && limit == null && items.length > rowLimit
	);
	const visible = $derived(
		limit != null
			? items.slice(0, limit)
			: expanded || !needsToggle
				? items
				: items.slice(0, rowLimit)
	);
</script>

<div>
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-lg font-medium">{title}</h2>
		{#if headerActions}
			<div class="flex flex-wrap items-center justify-end gap-2">
				{@render headerActions()}
			</div>
		{/if}
	</div>
	{#if items.length === 0}
		{#if empty}
			{@render empty()}
		{:else}
			<p class="text-sm text-text-muted">—</p>
		{/if}
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each visible as item (item.id)}
				{@render children(item)}
			{/each}
		</div>
		{#if needsToggle}
			<div class="mt-3">
				<Button
					variant="secondary"
					onclick={() => {
						expanded = !expanded;
					}}
				>
					{expanded ? t('showLess') : t('showMore')}
				</Button>
			</div>
		{/if}
	{/if}
</div>
