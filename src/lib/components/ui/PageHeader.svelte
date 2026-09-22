<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		editable = false,
		class: className = '',
		actions,
		ontitlecommit
	}: {
		title: string;
		description?: string;
		/** Double-click / Enter|F2 when focused → rename. */
		editable?: boolean;
		class?: string;
		actions?: Snippet;
		/** Persist new title (blur / Enter). Empty → cancel. */
		ontitlecommit?: (next: string) => void | Promise<void>;
	} = $props();

	let editing = $state(false);
	let draft = $state('');
	let inputEl: HTMLInputElement | undefined = $state();

	function startEdit() {
		if (!editable || editing) return;
		draft = title;
		editing = true;
		queueMicrotask(() => {
			inputEl?.focus();
			inputEl?.select();
		});
	}

	async function commitEdit() {
		if (!editing) return;
		editing = false;
		const next = draft.trim();
		if (!next || next === title) return;
		await ontitlecommit?.(next);
	}

	function cancelEdit() {
		editing = false;
		draft = title;
	}

	function onTitleKeydown(e: KeyboardEvent) {
		if (!editable || editing) return;
		if (e.key === 'Enter' || e.key === 'F2' || e.key === 'Tab') {
			e.preventDefault();
			startEdit();
		}
	}

	function onInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void commitEdit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelEdit();
		}
	}
</script>

<header class="flex flex-wrap items-center justify-between gap-4 {className}">
	<div class="min-w-0 flex-1">
		{#if editing}
			<input
				bind:this={inputEl}
				bind:value={draft}
				class="w-full max-w-xl rounded-[8px] border border-border-focus bg-bg px-2 py-1 text-3xl font-medium tracking-tight text-text outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
				aria-label="Название задачи"
				onblur={() => void commitEdit()}
				onkeydown={onInputKeydown}
			/>
		{:else if editable}
			<button
				type="button"
				class="block max-w-full truncate text-left text-3xl font-medium tracking-tight text-text cursor-text rounded-[4px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
				ondblclick={startEdit}
				onkeydown={onTitleKeydown}
				title="Двойной клик или Tab/Enter — переименовать"
			>
				{title}
			</button>
		{:else}
			<h1 class="text-3xl font-medium tracking-tight text-text">{title}</h1>
		{/if}
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
