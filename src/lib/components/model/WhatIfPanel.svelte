<script lang="ts">
	import { t } from '$lib/i18n';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { formatPlanNumber } from './format-plan-number';
	import type { WhatIfRow } from './solve-session.svelte';

	let {
		rows,
		generationIndex = 0,
		generationCount = 1,
		onGenerationChange,
		activeHint,
		archiveHint
	}: {
		rows: WhatIfRow[];
		/** 0-based; pager shown when generationCount > 1 */
		generationIndex?: number;
		generationCount?: number;
		onGenerationChange?: (index: number) => void;
		/** Shown when viewing the latest generation */
		activeHint?: string;
		/** Shown for archived generations (already localized) */
		archiveHint?: string;
	} = $props();

	const showPager = $derived(generationCount > 1);
	const hint = $derived(
		showPager
			? generationIndex >= generationCount - 1
				? (activeHint ?? t('generationActiveHint'))
				: (archiveHint ?? '')
			: null
	);
</script>

{#if rows.length}
	<Card>
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-medium">{t('whatIf')}</h2>
			{#if showPager && onGenerationChange}
				<div class="flex items-center gap-3">
					<Button
						variant="ghost"
						class="!px-2 !py-1"
						disabled={generationIndex <= 0}
						onclick={() => onGenerationChange(generationIndex - 1)}>←</Button
					>
					<span class="font-mono text-sm">{generationIndex + 1}/{generationCount}</span>
					<Button
						variant="ghost"
						class="!px-2 !py-1"
						disabled={generationIndex >= generationCount - 1}
						onclick={() => onGenerationChange(generationIndex + 1)}>→</Button
					>
				</div>
			{/if}
		</div>
		{#if hint}
			<p class="mb-3 text-xs text-text-soft">{hint}</p>
		{/if}
		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead>
					<tr class="border-b border-border text-text-muted">
						<th class="py-2 pr-3">{t('mutation')}</th>
						<th class="py-2 text-right">Z</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row, i (`${row.title}-${i}`)}
						<tr class="border-b border-border-soft">
							<td class="py-2 pr-3">{row.title}</td>
							<td class="py-2 text-right font-mono tabular-nums">
								{Number.isFinite(row.Z) ? formatPlanNumber(row.Z) : '—'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Card>
{/if}
