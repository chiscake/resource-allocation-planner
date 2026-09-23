<script lang="ts">
	import type { Model, WhatIfDefaults } from '$lib/domain';
	import { Cloud } from '@lucide/svelte';
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
		showCloudSplit = false,
		onWhatIfChange,
		onSolve,
		onSolveCloud
	}: {
		model: Model;
		activeTab?: string;
		includeSensitivity?: boolean;
		busy?: boolean;
		/** Guest: show «Войти и сохранить» next to solve. */
		showLoginCta?: boolean;
		/** Authenticated: fused local / cloud solve control. */
		showCloudSplit?: boolean;
		onWhatIfChange: (field: keyof WhatIfDefaults, raw: string) => void;
		onSolve: () => void;
		onSolveCloud?: () => void;
	} = $props();

	const useCloudSplit = $derived(showCloudSplit && onSolveCloud != null);

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
		{#if useCloudSplit}
			<p class="mr-auto flex items-center gap-1.5 text-xs text-text-muted">
				<Cloud size={14} strokeWidth={1.75} aria-hidden="true" />
				{t('solveCloudHint')}
			</p>
		{/if}
		{#if showLoginCta}
			<Button variant="secondary" href="/login">{t('loginAndSave')}</Button>
		{/if}
		{#if useCloudSplit}
			<div class="inline-flex overflow-hidden rounded-[8px]">
				<Button
					class="!rounded-none !rounded-l-[8px]"
					disabled={busy || !methodReady}
					onclick={onSolve}
				>
					{t('solve')}
				</Button>
				<button
					type="button"
					class="inline-flex cursor-pointer items-center justify-center border-l border-white/25 bg-accent px-3 py-2.5 text-white transition-colors duration-200 hover:bg-text-medium active:bg-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
					disabled={busy || !methodReady}
					aria-label={t('solveCloudAria')}
					title={t('solveCloudAria')}
					onclick={() => onSolveCloud?.()}
				>
					<Cloud size={18} strokeWidth={1.75} aria-hidden="true" />
				</button>
			</div>
		{:else}
			<Button disabled={busy || !methodReady} onclick={onSolve}>{t('solve')}</Button>
		{/if}
	</div>
{/if}
