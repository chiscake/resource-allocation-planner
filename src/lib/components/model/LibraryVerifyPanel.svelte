<script lang="ts">
  import type { VerifyItemReport, VerifyReport } from '$lib/solver/verify';
  import { t } from '$lib/i18n';
  import { formatPlanNumber } from './format-plan-number';

  let { report }: { report: VerifyReport | null } = $props();

  let open = $state(false);

  const entries = $derived.by(() => {
    if (!report) return [] as VerifyItemReport[];
    const list: VerifyItemReport[] = [];
    if (report.root) list.push(report.root);
    list.push(...report.items);
    return list;
  });
</script>

{#if report}
  <div class="mt-4">
    <button
      type="button"
      class="cursor-pointer text-xs text-text-soft underline-offset-2 hover:text-text-muted hover:underline"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      {open ? t('libraryVerifyHide') : t('libraryVerify')}
    </button>
    {#if open}
      <div class="mt-2">
        <p class="mb-3 text-xs leading-relaxed text-text-faint">{t('libraryVerifyHint')}</p>
        <ul class="flex flex-col gap-2">
          {#each entries as item (item.label)}
            <li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <span class="font-medium text-text">{item.label}</span>
              {#if item.diff.kind === 'equal'}
                <span class="text-text-muted">{t('libraryVerifyOk')}</span>
              {:else if item.diff.kind === 'alternate_optima'}
                <span class="text-text-soft">{t('libraryVerifyAlternate')}</span>
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
    {/if}
  </div>
{/if}
