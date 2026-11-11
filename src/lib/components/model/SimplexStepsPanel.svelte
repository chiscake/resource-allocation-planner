<script lang="ts">
	import type { SimplexTraceFrame, SolveTrace } from '$lib/domain';
	import { t } from '$lib/i18n';
	import { formatPlanNumber } from './format-plan-number';

	let { trace }: { trace: SolveTrace | null } = $props();

	const lpTrace = $derived(trace?.method === 'lp' ? trace : null);

	const EPS = 1e-9;

	function frameKey(frame: SimplexTraceFrame, i: number): string {
		return `${frame.phase ?? ''}-${frame.entering ?? ''}-${frame.leaving ?? ''}-${i}`;
	}

	/** Min-ratio b/a when the enter column is eligible for that constraint row. */
	function minRatio(b: number, a: number): number | null {
		if (a <= EPS) return null;
		const ratio = b / a;
		if (ratio < -EPS) return null;
		return ratio;
	}
</script>

{#if !lpTrace}
	<p class="text-sm text-text-muted">{t('solveDetailsEmpty')}</p>
{:else}
	<div class="flex flex-col gap-5">
		{#if lpTrace.frames.length}
			<section>
				<h3 class="mb-2 text-sm font-medium text-text">{t('solveDetailsPrimal')}</h3>
				<div class="flex flex-col gap-4">
					{#each lpTrace.frames as frame, i (frameKey(frame, i))}
						{@render frameBlock(frame, i, lpTrace.frames[i + 1]?.entering)}
					{/each}
				</div>
			</section>
		{/if}

		{#if lpTrace.dual_frames?.length}
			<section>
				<h3 class="mb-2 text-sm font-medium text-text">{t('solveDetailsDual')}</h3>
				<div class="flex flex-col gap-4">
					{#each lpTrace.dual_frames as frame, i (frameKey(frame, i))}
						{@render frameBlock(frame, i, lpTrace.dual_frames[i + 1]?.entering)}
					{/each}
				</div>
			</section>
		{/if}

		{#if !lpTrace.frames.length && !lpTrace.dual_frames?.length}
			<p class="text-sm text-text-muted">{t('solveDetailsEmpty')}</p>
		{/if}
	</div>
{/if}

{#snippet frameBlock(frame: SimplexTraceFrame, i: number, nextEntering?: string)}
	{@const enterCol =
		nextEntering && frame.colLabels ? frame.colLabels.indexOf(nextEntering) : -1}
	{@const rhsCol = frame.matrix?.[0] ? frame.matrix[0].length - 1 : -1}
	{@const lastRow = frame.matrix ? frame.matrix.length - 1 : -1}
	<div class="rounded-[8px] border border-border-soft bg-bg-soft/40 p-3">
		<div class="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-text">
			<span class="font-medium text-text-muted">#{i + 1}</span>
			{#if frame.phase}
				<span>{t('solveDetailsPhase', { phase: String(frame.phase) })}</span>
			{/if}
			{#if frame.note}
				<span class="text-text-muted">{frame.note}</span>
			{/if}
			{#if frame.entering}
				<span class="font-mono text-xs tabular-nums">→ {frame.entering}</span>
			{/if}
			{#if frame.leaving}
				<span class="font-mono text-xs tabular-nums">← {frame.leaving}</span>
			{/if}
			{#if frame.Z != null && Number.isFinite(frame.Z)}
				<span class="ml-auto font-mono tabular-nums">Z = {formatPlanNumber(frame.Z)}</span>
			{/if}
		</div>

		{#if frame.matrix?.length}
			<div class="overflow-x-auto">
				<table class="w-max min-w-full border-collapse text-sm font-mono tabular-nums">
					{#if frame.colLabels?.length}
						<thead>
							<tr class="border-b border-border text-text-muted">
								<th class="px-2 py-1 text-left font-medium"></th>
								{#each frame.colLabels as label, ci (`c-${ci}-${label}`)}
									<th class="px-2 py-1 text-right font-medium">{label}</th>
								{/each}
							</tr>
						</thead>
					{/if}
					<tbody>
						{#each frame.matrix as row, ri (`r-${ri}`)}
							<tr class="border-b border-border-soft last:border-0">
								<td class="px-2 py-1 text-left text-text-muted">
									{frame.rowLabels?.[ri] ?? ''}
								</td>
								{#each row as cell, ci (`${ri}-${ci}`)}
									<td class="px-2 py-1 text-right text-text">
										{#if ri < lastRow && ci === rhsCol && enterCol >= 0}
											{@const ratio = minRatio(row[rhsCol], row[enterCol])}
											{#if ratio != null}
												{formatPlanNumber(cell)}
												<span class="text-text-muted">({formatPlanNumber(ratio)})</span>
											{:else}
												{formatPlanNumber(cell)}
											{/if}
										{:else}
											{formatPlanNumber(cell)}
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/snippet}
