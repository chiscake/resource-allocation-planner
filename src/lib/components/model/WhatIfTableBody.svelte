<script lang="ts">
	import { t } from '$lib/i18n';
	import { mutationKindOrder } from '$lib/domain';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { formatPlanNumber } from './format-plan-number';
	import LpModelMatrix from './LpModelMatrix.svelte';
	import type { WhatIfRow } from './solve-session.svelte';

	let {
		rows
	}: {
		rows: WhatIfRow[];
	} = $props();

	type SortMode = 'kind' | 'zDesc';

	let sortMode = $state<SortMode>('kind');
	let expandedKeys = $state<string[]>([]);

	const ZERO_EPS = 1e-9;

	function rowKey(row: WhatIfRow, index: number): string {
		const m = row.mutation;
		if (m) return `${m.kind}:${m.target}:${m.delta}`;
		return `i:${index}:${row.title}`;
	}

	const sortedRows = $derived.by(() => {
		const indexed = rows.map((row, index) => ({ row, index, key: rowKey(row, index) }));
		if (sortMode === 'zDesc') {
			return [...indexed].sort((a, b) => {
				const za = Number.isFinite(a.row.Z) ? a.row.Z : Number.NEGATIVE_INFINITY;
				const zb = Number.isFinite(b.row.Z) ? b.row.Z : Number.NEGATIVE_INFINITY;
				if (zb !== za) return zb - za;
				return a.index - b.index;
			});
		}
		return [...indexed].sort((a, b) => {
			const ka = mutationKindOrder(a.row.mutation?.kind);
			const kb = mutationKindOrder(b.row.mutation?.kind);
			if (ka !== kb) return ka - kb;
			return a.index - b.index;
		});
	});

	const hasExpanded = $derived(expandedKeys.length > 0);
	const colCount = 6;

	function sortBtnClass(mode: SortMode): string {
		return sortMode === mode
			? '!bg-brand-soft !text-brand'
			: '!text-text-muted hover:!bg-surface';
	}

	function isExpanded(key: string): boolean {
		return expandedKeys.includes(key);
	}

	function toggleRow(key: string) {
		if (expandedKeys.includes(key)) {
			expandedKeys = expandedKeys.filter((k) => k !== key);
		} else {
			expandedKeys = [...expandedKeys, key];
		}
	}

	function collapseAll() {
		expandedKeys = [];
	}

	function fmtDelta(v: number): string {
		if (!Number.isFinite(v)) return '—';
		const s = formatPlanNumber(v);
		if (Math.abs(v) < ZERO_EPS) return formatPlanNumber(0);
		return v > 0 ? `+${s}` : s;
	}

	function shadowLabel(row: WhatIfRow): string {
		if (row.shadowKind === 'resource') return t('whatIfShadowResource');
		if (row.shadowKind === 'modernization') return t('whatIfModernizationPrice');
		return t('whatIfShadowCol');
	}

	function shadowExplain(row: WhatIfRow): string {
		if (row.shadowKind === 'resource') return t('whatIfShadowExplainResource');
		if (row.shadowKind === 'modernization') return t('whatIfShadowExplainModernization');
		return '';
	}

	function planEntries(row: WhatIfRow): [string, number][] {
		const keys = row.mutatedModel?.products?.length
			? row.mutatedModel.products
			: Object.keys(row.plan ?? {});
		return keys.map((k) => [k, row.plan?.[k] ?? 0]);
	}

	function isZeroPlan(v: number): boolean {
		return !Number.isFinite(v) || Math.abs(v) < ZERO_EPS;
	}
</script>

<div class="mb-3 flex flex-wrap items-center gap-2">
	<div class="flex flex-wrap items-center gap-1">
		<Button
			variant="ghost"
			class="!px-2.5 !py-1 text-xs {sortBtnClass('kind')}"
			onclick={() => (sortMode = 'kind')}
		>
			{t('whatIfSortByKind')}
		</Button>
		<Button
			variant="ghost"
			class="!px-2.5 !py-1 text-xs {sortBtnClass('zDesc')}"
			onclick={() => (sortMode = 'zDesc')}
		>
			{t('whatIfSortByZ')}
		</Button>
	</div>
	{#if hasExpanded}
		<button
			type="button"
			class="ml-auto cursor-pointer text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
			onclick={collapseAll}
		>
			{t('whatIfCollapseAll')}
		</button>
	{/if}
</div>

<div class="overflow-x-auto">
	<table class="w-full text-left text-sm">
		<thead>
			<tr class="border-b border-border text-text-muted">
				<th class="py-2 pr-3">{t('mutation')}</th>
				<th class="py-2 pr-3">{t('mutationBefore')}</th>
				<th class="py-2 pr-3">{t('mutationAfter')}</th>
				<th class="py-2 pr-3 text-right">Z</th>
				<th class="py-2 pr-3 text-right">{t('whatIfDeltaZ')}</th>
				<th class="py-2 text-right">{t('whatIfShadowCol')}</th>
			</tr>
		</thead>
		<tbody>
			{#each sortedRows as { row, key } (key)}
				<tr
					class="cursor-pointer border-b border-border-soft hover:bg-bg-soft/60"
					onclick={() => toggleRow(key)}
				>
					<td class="py-2 pr-3">{row.title}</td>
					<td class="py-2 pr-3 font-mono text-xs tabular-nums text-text-muted">
						{row.before ?? '—'}
					</td>
					<td class="py-2 pr-3 font-mono text-xs tabular-nums text-text-muted">
						{row.after ?? '—'}
					</td>
					<td class="py-2 pr-3 text-right font-mono tabular-nums">
						{Number.isFinite(row.Z) ? formatPlanNumber(row.Z) : '—'}
					</td>
					<td class="py-2 pr-3 text-right font-mono tabular-nums text-text-muted">
						{fmtDelta(row.deltaZ)}
					</td>
					<td class="py-2 text-right font-mono tabular-nums">
						{#if row.shadowMetric != null && Number.isFinite(row.shadowMetric)}
							{formatPlanNumber(row.shadowMetric)}
						{:else}
							<span class="text-text-faint">{t('whatIfShadowNone')}</span>
						{/if}
					</td>
				</tr>
				{#if isExpanded(key)}
					<tr class="border-b border-border-soft bg-bg-soft/40">
						<td colspan={colCount} class="px-2 py-3">
							{#if row.shadowKind !== 'none'}
								<p class="mb-3 text-xs leading-relaxed text-text-soft">
									<span class="font-medium text-text-muted">{shadowLabel(row)}:</span>
									{shadowExplain(row)}
								</p>
							{/if}

							<p class="mb-2 text-xs font-medium text-text-muted">{t('whatIfPlanAfter')}</p>
							<table class="mb-4 w-full max-w-md text-sm">
								<tbody>
									{#each planEntries(row) as [name, value] (name)}
										<tr
											class="border-b border-border-soft last:border-0 {isZeroPlan(value)
												? 'text-text-faint'
												: 'text-text'}"
										>
											<td class="py-1 pr-3">{name}</td>
											<td class="py-1 text-right font-mono tabular-nums">
												{formatPlanNumber(value)}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>

							{#if row.criticalResources?.length}
								<p class="mb-2 text-xs font-medium text-text-muted">{t('whatIfCriticalAfter')}</p>
								<ul class="mb-4 flex flex-wrap gap-2">
									{#each row.criticalResources as name (name)}
										<li class="inline-flex items-center gap-1.5 text-sm">
											<span>{name}</span>
											<Badge variant="warning">{t('criticalBadge')}</Badge>
										</li>
									{/each}
								</ul>
							{/if}

							{#if row.mutatedModel}
								<p class="mb-2 text-xs font-medium text-text-muted">{t('mutationShowMatrix')}</p>
								<LpModelMatrix model={row.mutatedModel} readonly />
							{/if}
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
</div>
