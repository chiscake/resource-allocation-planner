<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

	let {
		variant = 'primary',
		disabled = false,
		type = 'button',
		href,
		onclick,
		class: className = '',
		title,
		'aria-label': ariaLabel,
		'aria-expanded': ariaExpanded,
		children
	}: {
		variant?: Variant;
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		href?: string;
		onclick?: (event: MouseEvent) => void;
		class?: string;
		title?: string;
		'aria-label'?: string;
		'aria-expanded'?: boolean | 'true' | 'false';
		children?: Snippet;
	} = $props();

	const base =
		'inline-flex cursor-pointer items-center justify-center text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';

	const variants: Record<Variant, string> = {
		primary:
			'rounded-[8px] bg-accent px-5 py-2.5 text-white hover:bg-text-medium active:bg-text-strong',
		secondary:
			'rounded-[8px] border border-border bg-transparent px-5 py-2.5 text-text hover:bg-bg-soft active:bg-surface',
		danger:
			'rounded-[8px] border border-danger-bg bg-danger-bg px-5 py-2.5 text-danger-text hover:bg-danger-text hover:text-white active:bg-danger-text',
		ghost: 'rounded-[6px] px-3 py-2 text-text hover:bg-surface hover:text-text-muted'
	};

	const classes = $derived(`${base} ${variants[variant]} ${className}`);
</script>

{#if href}
	<a
		{href}
		class={classes}
		{onclick}
		{title}
		aria-label={ariaLabel}
		aria-expanded={ariaExpanded}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		{type}
		{disabled}
		class={classes}
		{onclick}
		{title}
		aria-label={ariaLabel}
		aria-expanded={ariaExpanded}
	>
		{@render children?.()}
	</button>
{/if}
