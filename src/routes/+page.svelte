<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { isOnboardingDone, isTauri } from '$lib/platform';
	import { onMount } from 'svelte';

	let editionLabel = $state('Web версия');

	onMount(() => {
		if (!browser) return;
		const desktop = isTauri();
		editionLabel = desktop ? 'Desktop версия' : 'Web версия';
		if (desktop && !isOnboardingDone()) {
			void goto('/onboarding', { replaceState: true });
		}
	});
</script>

<svelte:head>
	<title>Планировщик распределения ресурсов</title>
</svelte:head>

<main class="shell">
	<p class="hero">{editionLabel}</p>
</main>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		min-height: 100%;
		background: #f3f3f3;
		font-family:
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
	}

	.shell {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 2rem;
		box-sizing: border-box;
	}

	.hero {
		margin: 0;
		font-size: clamp(2.5rem, 8vw, 5rem);
		font-weight: 700;
		letter-spacing: -0.03em;
		text-align: center;
		color: #111;
	}
</style>
