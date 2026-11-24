<script lang="ts">
  import type { SolveResult } from '$lib/domain';
  import { t } from '$lib/i18n';
  import { formatPlanNumber } from '$lib/display';

  let {
    title = '',
    result = null,
    footer = '',
    class: className = '',
  }: {
    title?: string;
    result?: SolveResult | null;
    footer?: string;
    class?: string;
  } = $props();
</script>

<div class="flex flex-col gap-3 {className}">
  {#if title}
    <p class="text-xl font-medium">{title}</p>
  {/if}
  {#if result?.Z != null}
    <p class="font-mono text-base text-text-muted">Z = {formatPlanNumber(result.Z)}</p>
  {/if}
  {#if result?.x && Object.keys(result.x).length > 0}
    <div>
      <p class="text-sm text-text-soft">{t('planLabel')}</p>
      <ul class="mt-1 space-y-0.5 font-mono text-sm text-text-muted">
        {#each Object.entries(result.x) as [k, v] (k)}
          <li>{k}: {formatPlanNumber(v)}</li>
        {/each}
      </ul>
    </div>
  {/if}
  {#if result?.shadow_prices && Object.keys(result.shadow_prices).length > 0}
    <div>
      <p class="text-sm text-text-soft">{t('dualPricesLabel')}</p>
      <ul class="mt-1 space-y-0.5 font-mono text-sm text-text-muted">
        {#each Object.entries(result.shadow_prices) as [k, v] (k)}
          <li>{k}: {formatPlanNumber(v)}</li>
        {/each}
      </ul>
    </div>
  {/if}
  {#if footer}
    <p class="text-sm text-text-muted">{footer}</p>
  {/if}
</div>
