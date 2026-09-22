<script lang="ts">
	import type { Model } from '$lib/domain';
	import MatrixThumb from '$lib/components/model/MatrixThumb.svelte';

	let {
		href,
		title,
		updatedAt,
		createdAt,
		model,
		favorite = false,
		class: className = ''
	}: {
		href: string;
		title: string;
		updatedAt?: string | null;
		createdAt?: string | null;
		model?: Model | null;
		favorite?: boolean;
		class?: string;
	} = $props();

	const when = $derived(updatedAt || createdAt || null);
	const timeLabel = $derived(
		when
			? new Date(when).toLocaleString('ru-RU', {
					day: '2-digit',
					month: 'short',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				})
			: '—'
	);
</script>

<a
	class="task-preview-card group flex flex-col overflow-hidden rounded-[12px] border border-border bg-bg transition-colors hover:border-border-strong hover:bg-bg-soft {className}"
	{href}
>
	<MatrixThumb {model} class="rounded-none border-0 border-b border-border" />
	<div class="flex flex-1 flex-col gap-1 px-3 py-2.5">
		<div class="flex items-start justify-between gap-2">
			<span class="line-clamp-2 text-sm font-medium text-text group-hover:text-brand">
				{title}
			</span>
			{#if favorite}
				<span class="shrink-0 text-xs text-brand" title="Избранное">★</span>
			{/if}
		</div>
		<time class="text-xs text-text-soft" datetime={when ?? undefined}>{timeLabel}</time>
	</div>
</a>
