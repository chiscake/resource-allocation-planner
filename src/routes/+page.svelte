<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { editionLabel, isOnboardingDone, isTauri } from '$lib/platform';
	import { t } from '$lib/i18n';
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
			<a
				href="#download"
				class="rounded-[8px] bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-text-medium"
			>
				{t('downloadDesktop')}
			</a>
		{/if}
		<a href="/login" class="rounded-[8px] border border-border px-5 py-3 text-sm hover:bg-surface"
			>{t('login')}</a
		>
		<button
			type="button"
			class="rounded-[8px] border border-border px-5 py-3 text-sm hover:bg-surface"
			onclick={tryGuest}
		>
			{t('tryAsGuest')}
		</button>
	</div>
	<p class="max-w-md text-center text-xs text-text-soft">{t('guestUpload')}</p>
</main>
