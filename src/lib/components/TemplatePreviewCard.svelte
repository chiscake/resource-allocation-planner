<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Model } from '$lib/domain';
	import MatrixThumb from '$lib/components/model/MatrixThumb.svelte';

	let {
		title,
		model,
		href,
		subtitle,
		actions,
		class: className = ''
	}: {
		title: string;
		model?: Model | null;
		/** When set, thumb + title navigate here. */
		href?: string;
		subtitle?: string;
		/** Footer actions (Use / Edit / Delete / …). */
		actions?: Snippet;
		class?: string;
	} = $props();
</script>

<div
	class="template-preview-card group flex flex-col overflow-hidden rounded-[12px] border border-border bg-bg transition-colors hover:border-border-strong hover:bg-bg-soft {className}"
>
	{#if href}
		<a
			class="flex min-h-0 flex-col outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
			{href}
		>
			<MatrixThumb {model} class="rounded-none border-0 border-b border-border" />
			<div class="flex flex-col gap-1 px-3 py-2.5">
				<span class="line-clamp-2 text-sm font-medium text-text group-hover:text-brand"
					>{title}</span
				>
				{#if subtitle}
					<span class="text-xs text-text-soft">{subtitle}</span>
				{/if}
			</div>
		</a>
	{:else}
		<MatrixThumb {model} class="rounded-none border-0 border-b border-border" />
		<div class="flex flex-1 flex-col gap-3 px-3 py-3">
			<span class="line-clamp-2 text-sm font-medium text-text">{title}</span>
			{#if subtitle}
				<span class="text-xs text-text-soft">{subtitle}</span>
			{/if}
			{#if actions}
				<div class="mt-auto flex flex-wrap items-center gap-2">
					{@render actions()}
				</div>
			{/if}
		</div>
	{/if}

	{#if href && actions}
		<div class="flex flex-wrap items-center gap-2 border-t border-border-soft px-3 py-2.5">
			{@render actions()}
		</div>
	{/if}
</div>
