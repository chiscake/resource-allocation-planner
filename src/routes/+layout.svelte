<script lang="ts">
	import { Toaster } from 'svelte-sonner';
	import '../app.css';
	import { t } from '$lib/i18n';

	let { children } = $props();
</script>

<svelte:head>
	<title>{t('appTitle')}</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500&display=swap"
	/>
</svelte:head>

<div class="min-h-screen bg-bg text-text antialiased">
	{@render children()}
</div>

<Toaster
	theme="light"
	position="bottom-right"
	richColors={false}
	toastOptions={{
		class: 'rap-toast',
		style: 'background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border);'
	}}
/>
