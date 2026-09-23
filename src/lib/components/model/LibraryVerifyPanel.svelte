<script lang="ts">
	import type { VerifyItemReport, VerifyReport } from '$lib/solver/verify';
	import { t } from '$lib/i18n';
	import { formatPlanNumber } from './format-plan-number';

	let { report }: { report: VerifyReport | null } = $props();

	const entries = $derived.by(() => {
		if (!report) return [] as VerifyItemReport[];
		const list: VerifyItemReport[] = [];
		if (report.root) list.push(report.root);
		list.push(...report.items);
		return list;
	});
</script>

{#if report}
	<details class="mt-4 rounded-[8px] border border-border-soft">
		<summary
			class="cursor-pointer list-none px-3 py-2 text-sm font-medium text-text [&::-webkit-details-marker]:hidden"
		>
			{t('libraryVerify')}
		</summary>
		<div class="border-t border-border-soft px-3 py-3">
			<p class="mb-3 text-xs leading-relaxed text-text-soft">{t('libraryVerifyHint')}</p>
			<ul class="flex flex-col gap-2">
				{#each entries as item (item.label)}
					<li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
						<span class="font-medium text-text">{item.label}</span>
						{#if item.diff.match}
							<span class="text-text-muted">{t('libraryVerifyOk')}</span>
						{:else}
							<span class="text-warning-text">{t('libraryVerifyFail')}</span>
						{/if}
						<span class="font-mono text-xs tabular-nums text-text-muted">
							Z = {formatPlanNumber(item.native.result?.Z ?? Number.NaN)} · max|Δx| =
							{formatPlanNumber(item.diff.maxAbsDx)}
						</span>
					</li>
				{/each}
			</ul>
		</div>
	</details>
{/if}
