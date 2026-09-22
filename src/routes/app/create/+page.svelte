<script lang="ts">
	import { onMount } from 'svelte';
	import { createEmptySolveNodeAndOpen } from '$lib/db/create-solve-node';
	import { t } from '$lib/i18n';

	let msg = $state('');

	onMount(async () => {
		const err = await createEmptySolveNodeAndOpen();
		if (err) msg = err.error;
	});
</script>

<section class="mx-auto flex max-w-2xl flex-col gap-3 py-8">
	{#if msg}
		<p class="text-danger-text">{msg}</p>
	{:else}
		<p class="text-sm text-text-muted">{t('creatingTask')}</p>
	{/if}
</section>
