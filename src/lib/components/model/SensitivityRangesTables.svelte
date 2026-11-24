<script lang="ts">
  import { t } from '$lib/i18n';
  import type { Model } from '$lib/domain';
  import { labeledProduct, labeledResource, shadowUnit } from '$lib/display/units';
  import { computeSensitivityRanges, type SensitivityRanges } from '$lib/solver';
  import { formatSensitivityNumber } from './format-plan-number';

  let {
    model,
  }: {
    model: Model;
  } = $props();

  const ranges = $derived.by((): SensitivityRanges | null => computeSensitivityRanges(model));
</script>

{#if ranges}
  <div class="space-y-5">
    <div>
      <h3 class="mb-1 text-sm font-medium text-text">{t('sensitivityRangesTitle')}</h3>
      <p class="mb-3 text-xs text-text-soft">{t('sensitivityRangesHint')}</p>
    </div>

    <div>
      <p class="mb-2 text-xs font-medium text-text-muted">{t('sensitivityRhsTable')}</p>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-border text-text-muted">
              <th class="py-2 pr-3">{t('exportResource')}</th>
              <th class="py-2 pr-3 text-right">{t('sensitivityColCurrent')}</th>
              <th class="py-2 pr-3 text-right">{t('sensitivityColAllowDec')}</th>
              <th class="py-2 pr-3 text-right">{t('sensitivityColAllowInc')}</th>
              <th class="py-2 pr-3 text-right">{t('sensitivityColLower')}</th>
              <th class="py-2 pr-3 text-right">{t('sensitivityColUpper')}</th>
              <th class="py-2 text-right">{t('sensitivityColShadow')}</th>
            </tr>
          </thead>
          <tbody>
            {#each ranges.rhs as row (row.resource)}
              <tr class="border-b border-border-soft">
                <td class="py-2 pr-3">{labeledResource(model, row.index)}</td>
                <td class="py-2 pr-3 text-right font-mono tabular-nums">
                  {formatSensitivityNumber(row.current)}
                </td>
                <td class="py-2 pr-3 text-right font-mono tabular-nums">
                  {formatSensitivityNumber(row.allowDecrease)}
                </td>
                <td class="py-2 pr-3 text-right font-mono tabular-nums">
                  {formatSensitivityNumber(row.allowIncrease)}
                </td>
                <td class="py-2 pr-3 text-right font-mono tabular-nums">
                  {formatSensitivityNumber(row.lower)}
                </td>
                <td class="py-2 pr-3 text-right font-mono tabular-nums">
                  {formatSensitivityNumber(row.upper)}
                </td>
                <td class="py-2 text-right font-mono tabular-nums">
                  {formatSensitivityNumber(row.shadowPrice)}
                  {#if shadowUnit(model, row.index)}
                    <span class="ml-1 text-[10px] text-text-faint">
                      {shadowUnit(model, row.index)}
                    </span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <div>
      <p class="mb-2 text-xs font-medium text-text-muted">{t('sensitivityObjTable')}</p>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-border text-text-muted">
              <th class="py-2 pr-3">{t('exportProduct')}</th>
              <th class="py-2 pr-3 text-right">{t('sensitivityColCurrent')}</th>
              <th class="py-2 pr-3 text-right">{t('sensitivityColAllowDec')}</th>
              <th class="py-2 pr-3 text-right">{t('sensitivityColAllowInc')}</th>
              <th class="py-2 pr-3 text-right">{t('sensitivityColLower')}</th>
              <th class="py-2 pr-3 text-right">{t('sensitivityColUpper')}</th>
              <th class="py-2 text-right">{t('sensitivityColReducedCost')}</th>
            </tr>
          </thead>
          <tbody>
            {#each ranges.objective as row (row.product)}
              <tr class="border-b border-border-soft">
                <td class="py-2 pr-3">{labeledProduct(model, row.index)}</td>
                <td class="py-2 pr-3 text-right font-mono tabular-nums">
                  {formatSensitivityNumber(row.current)}
                </td>
                <td class="py-2 pr-3 text-right font-mono tabular-nums">
                  {formatSensitivityNumber(row.allowDecrease)}
                </td>
                <td class="py-2 pr-3 text-right font-mono tabular-nums">
                  {formatSensitivityNumber(row.allowIncrease)}
                </td>
                <td class="py-2 pr-3 text-right font-mono tabular-nums">
                  {formatSensitivityNumber(row.lower)}
                </td>
                <td class="py-2 pr-3 text-right font-mono tabular-nums">
                  {formatSensitivityNumber(row.upper)}
                </td>
                <td class="py-2 text-right font-mono tabular-nums">
                  {formatSensitivityNumber(row.reducedCost)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}
