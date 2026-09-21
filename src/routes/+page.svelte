<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { editionLabel, isOnboardingDone, isTauri } from '$lib/platform';
	import { t } from '$lib/i18n';
	import Button from '$lib/components/ui/Button.svelte';
	import { onMount } from 'svelte';
	import { saveGuest } from '$lib/db/guest';
	import { createTask13Model } from '$lib/domain';

	let label = $state('Web версия');

	onMount(() => {
		if (!browser) return;
		label = editionLabel();
		if (isTauri() && !isOnboardingDone()) {
			void goto('/onboarding', { replaceState: true });
			return;
		}
		if (isTauri()) {
			void goto('/app', { replaceState: true });
		}
	});

	function tryGuest() {
		saveGuest({
			title: 'Задача 13 (гость)',
			model: createTask13Model(),
			updated_at: new Date().toISOString()
		});
		void goto('/login');
	}
</script>

<main class="grid min-h-screen place-items-center gap-8 p-8">
	<p class="text-center text-5xl font-medium tracking-tight text-text md:text-6xl">{label}</p>
	<div class="flex flex-wrap items-center justify-center gap-3">
		{#if !isTauri()}
			<Button variant="primary" href="#download">{t('downloadDesktop')}</Button>
		{/if}
		<Button variant="secondary" href="/login">{t('login')}</Button>
		<Button variant="secondary" onclick={tryGuest}>{t('tryAsGuest')}</Button>
	</div>
	<p class="max-w-md text-center text-xs text-text-soft">{t('guestUpload')}</p>
</main>
