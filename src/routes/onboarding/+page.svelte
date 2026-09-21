<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { completeOnboarding, isTauri } from '$lib/platform';
	import { onMount } from 'svelte';

	onMount(() => {
		if (!browser) return;
		if (!isTauri()) {
			void goto('/', { replaceState: true });
		}
	});

	function continueToApp() {
		completeOnboarding();
		void goto('/');
	}
</script>

<svelte:head>
	<title>Онбординг — Планировщик распределения ресурсов</title>
</svelte:head>

<main class="shell">
	<p class="hero">Desktop версия</p>
	<button type="button" class="next" onclick={continueToApp}>Продолжить</button>
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
		place-content: center;
		gap: 2rem;
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

	.next {
		font: inherit;
		font-size: 1.125rem;
		padding: 0.75rem 1.5rem;
		border: 1px solid #222;
		background: #fff;
		cursor: pointer;
	}

	.next:hover {
		background: #eee;
	}
</style>
