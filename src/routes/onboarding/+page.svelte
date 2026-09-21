<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { completeOnboarding, isTauri } from '$lib/platform';
	import { t } from '$lib/i18n';
	import { onMount } from 'svelte';

	let step = $state(0);
	const steps = [
		'Планировщик распределения ресурсов — планы выпуска и what-if.',
		'Без входа: один локальный сценарий на устройстве.',
		'С аккаунтом: история, org, шаринг, сравнение.',
		'Регистрация отключена — вход по выданным учётным данным.'
	];

	onMount(() => {
		if (!browser) return;
		if (!isTauri()) void goto('/', { replaceState: true });
	});

	function next() {
		if (step < steps.length - 1) step += 1;
		else {
			completeOnboarding();
			void goto('/app');
		}
	}
</script>

<main class="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-8">
	<p class="text-4xl font-medium tracking-tight">{t('desktopEdition')}</p>
	<p class="text-text-muted">{steps[step]}</p>
	<p class="font-mono text-xs text-text-soft">{step + 1}/{steps.length}</p>
	<button
		type="button"
		class="rounded-[8px] border border-border bg-bg px-5 py-3 text-base font-medium hover:bg-surface"
		onclick={next}
	>
		{step < steps.length - 1 ? 'Далее' : t('continue')}
	</button>
</main>
