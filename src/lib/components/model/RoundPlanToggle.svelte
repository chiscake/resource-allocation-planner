<script lang="ts">
  import { setRoundPlanPreference } from "$lib/display";
  import { t } from "$lib/i18n";

  let { roundPlan = $bindable(false) }: { roundPlan?: boolean } = $props();

  function onRoundToggle(checked: boolean) {
    roundPlan = checked;
    setRoundPlanPreference(checked);
  }
</script>

<div>
  <label class="flex items-center gap-2 text-sm text-text">
    <input
      type="checkbox"
      checked={roundPlan}
      onchange={(e) => onRoundToggle(e.currentTarget.checked)}
    />
    {t("roundPlan")}
  </label>
  <details class="mt-1.5">
    <summary
      class="cursor-pointer list-none text-xs text-text-soft underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden"
    >
      {t("roundPlanHintToggle")}
    </summary>
    <p class="mt-1.5 text-xs leading-relaxed text-text-soft">
      {t("roundPlanHint")}
    </p>
  </details>
</div>
