<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';

	let {
		open = $bindable(false),
		title = '',
		onclose,
		children
	}: {
		open?: boolean;
		title?: string;
		onclose?: () => void;
		children?: Snippet;
	} = $props();

	const titleId = $props.id();

	function close() {
		open = false;
		onclose?.();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			close();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		role="presentation"
		transition:fade={{ duration: 150 }}
	>
		<button
			type="button"
			class="absolute inset-0 cursor-default border-0 bg-[rgba(10,10,10,0.5)] p-0"
			aria-label="Close"
			onclick={close}
		></button>
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby={title ? titleId : undefined}
			class="relative z-10 w-full max-w-lg rounded-[12px] border border-border bg-bg p-6 shadow-lg"
		>
			{#if title}
				<h2 id={titleId} class="mb-4 text-lg font-medium text-text">{title}</h2>
			{/if}
			{@render children?.()}
		</div>
	</div>
{/if}
