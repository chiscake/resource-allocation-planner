<script lang="ts">
  import type { Model, SolveResult, SolveTrace } from "$lib/domain";
  import { solveLocal } from "$lib/solver";
  import { t } from "$lib/i18n";
  import { formatPlanNumber } from "./format-plan-number";
  import GeometryPanel from "./visualization/GeometryPanel.svelte";
  import GaFitnessChart from "./GaFitnessChart.svelte";

  let {
    model,
    trace,
    lpOptimum = null,
    gapVsLp = null,
  }: {
    model: Model;
    trace: SolveTrace | null;
    lpOptimum?: SolveResult | null;
    gapVsLp?: number | null;
  } = $props();

  const gaTrace = $derived(trace?.method === "ga" ? trace : null);
  const generations = $derived(gaTrace?.generations ?? []);
  let selectedGen = $state(0);

  const resolvedLp = $derived.by(() => {
    if (lpOptimum) return lpOptimum;
    try {
      const res = solveLocal(model, "local", 0, "lp", "native");
      return res.result ?? null;
    } catch {
      return null;
    }
  });

  $effect(() => {
    selectedGen = Math.max(0, generations.length - 1);
  });

  const snap = $derived(generations[selectedGen] ?? null);
  const stopLabel = $derived.by(() => {
    const r = gaTrace?.meta?.stopReason;
    if (r === "stagnation") return t("gaStopStagnation");
    if (r === "maxGenerations") return t("gaStopMax");
    return "—";
  });
</script>

{#if !gaTrace || generations.length === 0}
  <p class="text-sm text-text-muted">{t("solveDetailsEmpty")}</p>
{:else}
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-4 text-sm">
      {#if gapVsLp != null && Number.isFinite(gapVsLp)}
        <p>
          <span class="text-text-muted">{t("gaGapVsLp")}:</span>
          <span class="font-mono tabular-nums">
            {(gapVsLp * 100).toFixed(2)}%</span
          >
        </p>
      {/if}
      <p>
        <span class="text-text-muted">{t("gaStopReason")}:</span>
        {stopLabel}
        {#if gaTrace.meta}
          <span class="font-mono text-text-muted">
            ({gaTrace.meta.generationsRun})</span
          >
        {/if}
      </p>
    </div>

    <GeometryPanel {model} trace={gaTrace} method="ga" lpOptimum={resolvedLp} />

    <GaFitnessChart {generations} />

    <div>
      <p class="mb-2 text-sm font-medium">{t("gaPopulationTable")}</p>
      <label class="mb-2 flex items-center gap-2 text-xs text-text-muted">
        Поколение
        <input
          type="range"
          class="flex-1 accent-brand"
          min="0"
          max={Math.max(0, generations.length - 1)}
          bind:value={selectedGen}
        />
        <span class="font-mono">{selectedGen}</span>
      </label>
      {#if snap}
        {@const productShare = Math.max(
          12,
          Math.floor(64 / Math.max(1, model.products.length)),
        )}
        <div class="overflow-x-auto rounded-[8px] border border-border-soft">
          <table class="w-full table-fixed text-left text-sm">
            <colgroup>
              <col style:width="7%" />
              {#each model.products as p (p)}
                <col style:width={`${productShare}%`} />
              {/each}
              <col style:width="18%" />
              <col style:width="8%" />
            </colgroup>
            <thead>
              <tr class="border-b border-border text-text-muted">
                <th class="px-2 py-1.5">#</th>
                {#each model.products as p (p)}
                  <th class="truncate px-2 py-1.5 font-mono text-xs" title={p}
                    >{p}</th
                  >
                {/each}
                <th class="px-2 py-1.5 text-right">fitness</th>
                <th class="px-2 py-1.5">ОДР</th>
              </tr>
            </thead>
            <tbody>
              {#each snap.population as ind, i (i)}
                <tr
                  class="border-b border-border-soft last:border-0 {i ===
                  snap.bestIndex
                    ? 'bg-success-bg/40'
                    : ''}"
                >
                  <td class="px-2 py-1 font-mono text-xs text-text-muted"
                    >{i}</td
                  >
                  {#each ind.genes as g, gi (gi)}
                    <td
                      class="truncate px-2 py-1 font-mono text-xs tabular-nums"
                      title={formatPlanNumber(g)}>{formatPlanNumber(g)}</td
                    >
                  {/each}
                  <td
                    class="truncate px-2 py-1 text-right font-mono text-xs tabular-nums"
                    title={formatPlanNumber(ind.fitness)}
                    >{formatPlanNumber(ind.fitness)}</td
                  >
                  <td class="px-2 py-1 text-xs">{ind.feasible ? "✓" : "✗"}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>
{/if}
