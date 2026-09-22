<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Model } from '$lib/domain';
	import { t } from '$lib/i18n';
	import Card from '$lib/components/ui/Card.svelte';
	import LpModelMatrix from './LpModelMatrix.svelte';
	import PlanSolveControls from './PlanSolveControls.svelte';
	import SolveResultPanel from './SolveResultPanel.svelte';
	import WhatIfPanel from './WhatIfPanel.svelte';
	import type { SolveSession, WhatIfRow } from './solve-session.svelte';

	let {
		session,
		showLoginCta = false,
		compact = false,
		solverLibrary = null,
		matrixFooter,
		planExtras,
		resultExtras,
		whatIfRows,
		whatIfGenerationIndex = 0,
		whatIfGenerationCount = 1,
		onWhatIfGenerationChange,
		whatIfActiveHint,
		whatIfArchiveHint,
		onModelChange,
		onWhatIfChange,
		onSolve
	}: {
		session: SolveSession;
		showLoginCta?: boolean;
		compact?: boolean;
		solverLibrary?: string | null;
		/** Below solve controls inside the matrix card (e.g. draft hint). */
		matrixFooter?: Snippet;
		/** Inside matrix card after controls (e.g. plan comments). */
		planExtras?: Snippet;
		/** Inside result panel (e.g. result comments). */
		resultExtras?: Snippet;
		/** Override session.whatIfItems (task generations). */
		whatIfRows?: WhatIfRow[];
		whatIfGenerationIndex?: number;
		whatIfGenerationCount?: number;
		onWhatIfGenerationChange?: (index: number) => void;
		whatIfActiveHint?: string;
		whatIfArchiveHint?: string;
		onModelChange: (next: Model) => void;
		onWhatIfChange: (field: Parameters<SolveSession['updateWhatIf']>[0], raw: string) => void;
		onSolve: () => void;
	} = $props();

	const model = $derived(session.model);
	const rows = $derived(whatIfRows ?? session.whatIfItems);
</script>

{#if model}
	<section class={['flex flex-col', compact ? 'gap-5' : 'gap-6']}>
		{#if session.error}
			<p class="rounded-[8px] bg-danger-bg px-3 py-2 text-sm text-danger-text">{session.error}</p>
		{/if}

		<Card>
			<p class="mb-2 text-sm font-medium">{t('modelMatrix')}</p>
			<LpModelMatrix {model} onchange={onModelChange} />
			<div class="mt-4">
				<PlanSolveControls
					{model}
					bind:activeTab={
						() => session.activeTab,
						(v) => (session.activeTab = v)
					}
					bind:includeSensitivity={
						() => session.includeSensitivity,
						(v) => (session.includeSensitivity = v)
					}
					busy={session.busy}
					{showLoginCta}
					{onWhatIfChange}
					{onSolve}
				/>
			</div>
			{#if matrixFooter}
				{@render matrixFooter()}
			{/if}
			{#if planExtras}
				<div class="mt-6 border-t border-border pt-4">
					{@render planExtras()}
				</div>
			{/if}
		</Card>

		{#if session.result && session.displayResult}
			{#key session.solveEpoch}
				<SolveResultPanel
					result={session.displayResult}
					bind:roundPlan={
						() => session.roundPlan,
						(v) => (session.roundPlan = v)
					}
					productOrder={model.products}
					resourceOrder={model.resources}
					{solverLibrary}
				>
					{#if resultExtras}
						{@render resultExtras()}
					{/if}
				</SolveResultPanel>
			{/key}
		{/if}

		<WhatIfPanel
			{rows}
			generationIndex={whatIfGenerationIndex}
			generationCount={whatIfGenerationCount}
			onGenerationChange={onWhatIfGenerationChange}
			activeHint={whatIfActiveHint}
			archiveHint={whatIfArchiveHint}
		/>
	</section>
{/if}
