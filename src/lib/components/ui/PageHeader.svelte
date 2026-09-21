<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		class: className = '',
		actions
	}: {
		title: string;
		description?: string;
		class?: string;
		actions?: Snippet;
	} = $props();
</script>

<header class="flex flex-wrap items-start justify-between gap-4 {className}">
	<div class="min-w-0 flex-1">
		<h1 class="text-3xl font-medium tracking-tight text-text">{title}</h1>
		{#if description}
			<p class="mt-1 text-sm text-text-muted">{description}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex shrink-0 flex-wrap items-center gap-2">
			{@render actions()}
		</div>
	{/if}
</header>
