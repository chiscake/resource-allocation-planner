<script lang="ts">
  import { setRoundPlanPreference } from '$lib/display';
  import { t } from '$lib/i18n';

  let { roundPlan = $bindable(false) }: { roundPlan?: boolean } = $props();

  function onRoundToggle(checked: boolean) {
    roundPlan = checked;
    setRoundPlanPreference(checked);
  }
</script>

<label class="flex items-center gap-2 text-sm text-text" title={t('roundPlanHint')}>
  <input
    type="checkbox"
    checked={roundPlan}
    aria-label="{t('roundPlan')}. {t('roundPlanHint')}"
    onchange={(e) => onRoundToggle(e.currentTarget.checked)}
  />
  {t('roundPlan')}
</label>
