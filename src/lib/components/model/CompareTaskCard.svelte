<script lang="ts">
  import { X } from '@lucide/svelte';
  import type { Model, SolveResult } from '$lib/domain';
  import { assessMatrixCompatibility, planDeltas, type MatrixCompatSeverity } from '$lib/domain';
  import { t } from '$lib/i18n';
  import { maybeRoundPlan } from '$lib/display';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import SolveResultPanel from './SolveResultPanel.svelte';

  let {
    title,
    model,
    result,
    roundPlan = false,
    isPrimary = false,
    primaryModel = null,
    primaryResult = null,
    onRemove,
  }: {
    title: string;
    model: Model | null;
    result: SolveResult | null;
    roundPlan?: boolean;
    isPrimary?: boolean;
    primaryModel?: Model | null;
    primaryResult?: SolveResult | null;
    onRemove?: () => void;
  } = $props();

  const display = $derived.by((): SolveResult | null => {
    if (!result) return null;
    if (!model) return result;
    return maybeRoundPlan(model, result, roundPlan);
  });

  const primaryDisplay = $derived.by((): SolveResult | null => {
    if (!primaryResult) return null;
    if (!primaryModel) return primaryResult;
    return maybeRoundPlan(primaryModel, primaryResult, roundPlan);
  });

  const severity = $derived.by((): MatrixCompatSeverity | null => {
    if (isPrimary || !model || !primaryModel) return null;
    return assessMatrixCompatibility(primaryModel, model);
  });

  const deltas = $derived.by(() => {
    if (isPrimary || !display || !primaryDisplay) return null;
    return planDeltas(primaryDisplay, display);
  });

  function warnText(s: MatrixCompatSeverity): string {
    if (s === 'dimension') return t('compareWarnDimension');
    if (s === 'names') return t('compareWarnNames');
    return t('compareWarnUnits');
  }
</script>

<div class="space-y-2">
  <div class="flex items-start justify-between gap-2">
    <p class="min-w-0 flex-1 font-medium text-text">{title}</p>
    {#if onRemove}
      <Button
        variant="ghost"
        class="shrink-0 px-1.5! py-1.5! text-text-muted!"
        aria-label={t('compareRemoveCard')}
        title={t('compareRemoveCard')}
        onclick={onRemove}
      >
        <X size={18} strokeWidth={1.75} aria-hidden="true" />
      </Button>
    {/if}
  </div>

  <!-- Same slot for primary badge / warning / invisible spacer so result cards align. -->
  <div class="min-h-5">
    {#if isPrimary}
      <span class="inline-flex rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
        {t('comparePrimaryBadge')}
      </span>
    {:else if severity}
      <p
        class="rounded-md px-2.5 py-1.5 text-xs leading-relaxed {severity === 'dimension'
          ? 'bg-danger-bg text-danger-text'
          : 'bg-warning-bg text-warning-text'}"
        role="status"
      >
        {warnText(severity)}
      </p>
    {:else}
      <span
        class="invisible inline-flex rounded-md px-2 py-0.5 text-xs font-medium"
        aria-hidden="true"
      >
        {t('comparePrimaryBadge')}
      </span>
    {/if}
  </div>

  {#if display}
    <SolveResultPanel
      result={display}
      {model}
      {roundPlan}
      productOrder={model?.products}
      resourceOrder={model?.resources}
      compareDeltas={deltas}
      comparePrecision
    />
  {:else}
    <Card>
      <p class="text-sm text-text-muted">{t('compareNeedResult')}</p>
    </Card>
  {/if}
</div>
