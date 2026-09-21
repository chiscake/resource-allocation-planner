<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { completeOnboarding, isTauri } from '$lib/platform';
	import { t } from '$lib/i18n';
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';

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
	<Card>
		<p class="text-text-muted">{steps[step]}</p>
		<p class="mt-3 font-mono text-xs text-text-soft">{step + 1}/{steps.length}</p>
		<Button class="mt-6 w-full" onclick={next}>
			{step < steps.length - 1 ? 'Далее' : t('continue')}
		</Button>
	</Card>
</main>
