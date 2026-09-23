<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SolveResult, SolveTrace } from '$lib/domain';
	import type { VerifyReport } from '$lib/solver/verify';
	import { setRoundPlanPreference } from '$lib/display';
	import { t } from '$lib/i18n';
	import Card from '$lib/components/ui/Card.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { formatPlanNumber } from './format-plan-number';
	import SimplexStepsPanel from './SimplexStepsPanel.svelte';
	import LibraryVerifyPanel from './LibraryVerifyPanel.svelte';

	const ZERO_EPS = 1e-9;

	let {
		result,
		roundPlan = $bindable(false),
		productOrder = undefined,
		resourceOrder = undefined,
		solverLibrary = null,
		showRoundToggle = true,
		trace = null,
		stepsAvailable = false,
		verifyReport = null,
		onRequestSteps,
		children
	}: {
		/** Already display-rounded via maybeRoundPlan when checkbox is on. */
		result: SolveResult;
		roundPlan?: boolean;
		/** Stable product column order (model.products). */
		productOrder?: string[];
		/** Stable resource row order (model.resources). */
		resourceOrder?: string[];
		solverLibrary?: string | null;
		/** Hide round checkbox (e.g. compare second column shares bind). */
		showRoundToggle?: boolean;
		trace?: SolveTrace | null;
		stepsAvailable?: boolean;
		verifyReport?: VerifyReport | null;
		/** Called once when user opens the steps details (parent may re-fetch native trace). */
		onRequestSteps?: () => void;
		/** Authenticated: result comments, etc. */
		children?: Snippet;
	} = $props();

	let stepsRequested = $state(false);

	const planEntries = $derived.by(() => {
		const keys = productOrder?.length ? productOrder : Object.keys(result.x);
		return keys.map((k) => [k, result.x[k] ?? 0] as [string, number]);
	});

	const criticalSet = $derived(new Set(result.critical_resources));

	const shadowEntries = $derived.by(() => {
		const prices = result.shadow_prices;
		if (!prices) return [] as [string, number][];
		const keys = resourceOrder?.length ? resourceOrder : Object.keys(prices);
		return keys
			.filter((k) => k in prices)
			.map((k) => [k, prices[k] ?? 0] as [string, number]);
	});

	const slackEntries = $derived.by(() => {
		const slack = result.resource_slack;
		if (!slack) return [] as [string, number][];
		const keys = resourceOrder?.length ? resourceOrder : Object.keys(slack);
		return keys
			.filter((k) => k in slack)
			.map((k) => [k, slack[k] ?? 0] as [string, number]);
	});

	function isZeroPlan(v: number): boolean {
		return !Number.isFinite(v) || Math.abs(v) < ZERO_EPS;
	}

	function onRoundToggle(checked: boolean) {
		roundPlan = checked;
		setRoundPlanPreference(checked);
	}

	function onStepsToggle(e: Event) {
		const el = e.currentTarget as HTMLDetailsElement;
		if (!el.open || stepsRequested) return;
		stepsRequested = true;
		onRequestSteps?.();
	}
</script>

<Card>
	<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
		<span class="text-sm font-medium text-text-muted">{t('zMax')}</span>
		<span class="font-mono text-4xl font-semibold tabular-nums tracking-tight text-brand">
			{formatPlanNumber(result.Z)}
		</span>
	</div>

	{#if solverLibrary}
		<p class="mt-2 text-xs text-text-soft">{t('solverLibrary')}: {solverLibrary}</p>
	{/if}

	<div class="mt-6">
		<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
			<p class="text-sm font-medium text-text">{t('guestPlan')}</p>
			{#if showRoundToggle}
				<label class="flex items-center gap-2 text-sm text-text">
					<input
						type="checkbox"
						checked={roundPlan}
						onchange={(e) => onRoundToggle(e.currentTarget.checked)}
					/>
					{t('roundPlan')}
				</label>
			{/if}
		</div>

		{#if showRoundToggle}
			<details class="mb-3">
				<summary
					class="cursor-pointer list-none text-xs text-text-soft underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden"
				>
					{t('roundPlanHintToggle')}
				</summary>
				<p class="mt-1.5 text-xs leading-relaxed text-text-soft">{t('roundPlanHint')}</p>
			</details>
		{/if}

		{#if roundPlan && !result.feasible}
			<p class="mb-3 text-sm text-warning-text">{t('roundPlanInfeasible')}</p>
		{/if}

		<table class="w-full text-sm">
			<tbody>
				{#each planEntries as [name, value] (name)}
					<tr
						class="border-b border-border-soft last:border-0 {isZeroPlan(value)
							? 'text-text-faint'
							: 'text-text'}"
					>
						<td class="py-1.5 pr-3">{name}</td>
						<td class="py-1.5 text-right font-mono tabular-nums">
							{formatPlanNumber(value)}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if result.critical_resources.length}
		<div class="mt-6">
			<p class="mb-2 text-sm font-medium text-text">{t('criticalResources')}</p>
			<ul class="flex flex-col gap-1.5">
				{#each result.critical_resources as name (name)}
					<li class="flex flex-wrap items-center gap-2 text-sm">
						<span class="text-text">{name}</span>
						<Badge variant="warning">{t('criticalBadge')}</Badge>
					</li>
				{/each}
			</ul>
		</div>
	{:else}
		<div class="mt-6">
			<p class="mb-1 text-sm font-medium text-text">{t('criticalResources')}</p>
			<p class="text-sm text-text-muted">—</p>
		</div>
	{/if}

	{#if shadowEntries.length}
		<div class="mt-6">
			<p class="mb-2 text-sm font-medium text-text">{t('shadowPrices')}</p>
			<table class="w-full text-sm">
				<tbody>
					{#each shadowEntries as [name, value] (name)}
						<tr class="border-b border-border-soft last:border-0">
							<td class="py-1.5 pr-3">
								<span class="inline-flex flex-wrap items-center gap-2">
									<span class={criticalSet.has(name) ? 'text-text' : 'text-text-muted'}
										>{name}</span
									>
									{#if criticalSet.has(name)}
										<Badge variant="warning">{t('criticalBadge')}</Badge>
									{/if}
								</span>
							</td>
							<td class="py-1.5 text-right font-mono tabular-nums text-text">
								{formatPlanNumber(value)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if slackEntries.length}
		<div class="mt-6">
			<p class="mb-2 text-sm font-medium text-text">{t('resourceSlack')}</p>
			<table class="w-full text-sm">
				<tbody>
					{#each slackEntries as [name, value] (name)}
						<tr class="border-b border-border-soft last:border-0">
							<td class="py-1.5 pr-3 text-text-muted">{name}</td>
							<td class="py-1.5 text-right font-mono tabular-nums text-text">
								{formatPlanNumber(value)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if stepsAvailable}
		<details class="mt-6" ontoggle={onStepsToggle}>
			<summary
				class="cursor-pointer list-none text-sm font-medium text-text underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden"
			>
				{t('solveDetails')}
			</summary>
			<div class="mt-3">
				<SimplexStepsPanel {trace} />
			</div>
		</details>
	{/if}

	<LibraryVerifyPanel report={verifyReport} />

	{#if children}
		<div class="mt-6 border-t border-border pt-4">
			{@render children()}
		</div>
	{/if}
</Card>
