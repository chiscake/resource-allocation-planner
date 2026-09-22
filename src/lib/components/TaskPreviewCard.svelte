<script lang="ts">
	import { Trash2 } from '@lucide/svelte';
	import type { Model } from '$lib/domain';
	import MatrixThumb from '$lib/components/model/MatrixThumb.svelte';
	import CardIconButton from '$lib/components/ui/CardIconButton.svelte';
	import { t } from '$lib/i18n';

	let {
		href,
		title,
		updatedAt,
		createdAt,
		model,
		favorite = false,
		onDelete,
		class: className = ''
	}: {
		href: string;
		title: string;
		updatedAt?: string | null;
		createdAt?: string | null;
		model?: Model | null;
		favorite?: boolean;
		onDelete?: () => void;
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

<div
	class="task-preview-card group flex flex-col overflow-hidden rounded-[12px] border border-border bg-bg transition-colors hover:border-border-strong hover:bg-bg-soft {className}"
>
	<a
		class="flex min-h-0 flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
		{href}
	>
		<MatrixThumb {model} class="rounded-none border-0 border-b border-border" />
	</a>
	<div class="flex items-start gap-2 px-3 py-2.5">
		<a
			class="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
			{href}
		>
			<div class="flex items-start gap-2">
				<span class="line-clamp-2 text-sm font-medium text-text group-hover:text-brand">
					{title}
				</span>
				{#if favorite}
					<span class="shrink-0 text-xs text-brand" title="Избранное">★</span>
				{/if}
			</div>
			<time class="mt-1 block text-xs text-text-soft" datetime={when ?? undefined}>{timeLabel}</time>
		</a>
		{#if onDelete}
			<CardIconButton
				tone="danger"
				class="!shrink-0"
				aria-label={t('deleteCard')}
				title={t('deleteCard')}
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onDelete();
				}}
			>
				<Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
			</CardIconButton>
		{/if}
	</div>
</div>
