<script lang="ts">
	import '../app.css';
	import { t } from '$lib/i18n';
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
	<slot />
</div>
