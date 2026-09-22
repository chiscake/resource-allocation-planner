<script lang="ts">
	import type { Model, WhatIfDefaults } from '$lib/domain';
	import { t } from '$lib/i18n';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';

	let {
		model,
		activeTab = $bindable('plan'),
		includeSensitivity = $bindable(false),
		busy = false,
		showLoginCta = false,
		onWhatIfChange,
		onSolve
	}: {
		model: Model;
		activeTab?: string;
		includeSensitivity?: boolean;
		busy?: boolean;
		/** Guest: show «Войти и сохранить» next to solve. */
		showLoginCta?: boolean;
		onWhatIfChange: (field: keyof WhatIfDefaults, raw: string) => void;
		onSolve: () => void;
	} = $props();

	const tabItems = [
		{ id: 'plan', label: t('tabPlan') },
		{ id: 'ipm', label: t('tabIpm') },
		{ id: 'ga', label: t('tabGa') },
		{ id: '4d', label: t('tab4d') }
	];

	const methodReady = $derived(activeTab !== '4d');

	/** Display %; null/undefined/NaN → empty (that family skipped on solve). */
	function pctToInput(v: number | null | undefined): string {
		if (v == null || !Number.isFinite(v)) return '';
		return String(Math.round(v * 100));
	}
</script>

<div>
	<p class="mb-2 text-sm font-medium">{t('solveMethod')}</p>
	<Tabs items={tabItems} bind:active={activeTab} />
</div>

{#if activeTab === 'plan'}
	<p class="mt-3 text-sm text-text-muted">{t('methodPlanHint')}</p>
{:else if activeTab === 'ipm'}
	<p class="mt-3 text-sm text-text-muted">{t('methodIpmHint')}</p>
{:else if activeTab === 'ga'}
	<p class="mt-3 text-sm text-text-muted">{t('methodGaHint')}</p>
{:else if activeTab === '4d'}
	<p class="mt-3 text-sm text-text-muted">{t('method4dHint')}</p>
{/if}

{#if methodReady}
	<label class="mt-3 flex items-center gap-2 text-sm">
		<input type="checkbox" bind:checked={includeSensitivity} />
		{t('whatIfEnable')}
	</label>

	{#if includeSensitivity}
		<div class="mt-3">
			<p class="mb-2 text-sm font-medium">{t('whatIfDefaults')}</p>
			<div class="grid gap-2 sm:grid-cols-3">
				<label class="text-sm">
					<span class="mb-1 block text-text-muted">{t('whatIfResourcePct')}</span>
					<Input
						type="number"
						step="1"
						min="0"
						value={pctToInput(model.what_if_defaults?.resource_pct)}
						oninput={(e) => onWhatIfChange('resource_pct', e.currentTarget.value)}
					/>
				</label>
				<label class="text-sm">
					<span class="mb-1 block text-text-muted">{t('whatIfModernizationPct')}</span>
					<Input
						type="number"
						step="1"
						min="0"
						value={pctToInput(model.what_if_defaults?.modernization_pct)}
						oninput={(e) => onWhatIfChange('modernization_pct', e.currentTarget.value)}
					/>
				</label>
				<label class="text-sm">
					<span class="mb-1 block text-text-muted">{t('whatIfPricePct')}</span>
					<Input
						type="number"
						step="1"
						min="0"
						value={pctToInput(model.what_if_defaults?.price_pct)}
						oninput={(e) => onWhatIfChange('price_pct', e.currentTarget.value)}
					/>
				</label>
			</div>
		</div>
	{/if}

	<div class="mt-4 flex flex-wrap items-center justify-end gap-2">
		{#if showLoginCta}
			<Button variant="secondary" href="/login">{t('loginAndSave')}</Button>
		{/if}
		<Button disabled={busy || !methodReady} onclick={onSolve}>{t('solve')}</Button>
	</div>
{/if}
