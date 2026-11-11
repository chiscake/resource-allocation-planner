<script lang="ts">
  import { tick } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { env } from "$env/dynamic/public";
  import type { Model, SolveTrace } from "$lib/domain";
  import { isDlnUiEnabled } from "$lib/features";
  import type { GaHyperparameters } from "$lib/solver/methods/ga";
  import type { GaPresetId } from "$lib/solver/methods/ga/presets";
  import type { DlnHyperparameters } from "$lib/solver/methods/dln";
  import type { DlnPresetId } from "$lib/solver/methods/dln/presets";
  import {
    listCompareConfigs,
    runMethodComparison,
    type CompareConfigId,
    type CompareRow,
  } from "$lib/solver/compare";
  import { t } from "$lib/i18n";
  import Card from "$lib/components/ui/Card.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { formatPlanNumber } from "./format-plan-number";
  import GeometryPanel from "./visualization/GeometryPanel.svelte";
  import SimplexStepsPanel from "./SimplexStepsPanel.svelte";
  import GaStepsPanel from "./GaStepsPanel.svelte";

  let {
    model,
    gaHyper,
    gaPreset = "balanced",
    dlnHyper,
    dlnPreset = "precise",
  }: {
    model: Model;
    gaHyper?: Partial<GaHyperparameters>;
    gaPreset?: GaPresetId;
    dlnHyper?: Partial<DlnHyperparameters>;
    dlnPreset?: DlnPresetId;
  } = $props();

  const showDln = isDlnUiEnabled(env.PUBLIC_SHOW_DLN);
  const configs = listCompareConfigs().filter(
    (c) => showDln || c.method !== "dln",
  );
  let selected = $state<CompareConfigId[]>(configs.map((c) => c.id));
  let rows = $state<CompareRow[]>([]);
  let busy = $state(false);
  let detailRow = $state<CompareRow | null>(null);
  let showOverlay = $state(true);
  let resultsMounted = $state(false);
  let resultsOpen = $state(false);

  function toggle(id: CompareConfigId, required?: boolean) {
    if (required) return;
    if (selected.includes(id)) {
      selected = selected.filter((x) => x !== id);
    } else {
      selected = [...selected, id];
    }
  }

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  async function run() {
    busy = true;
    detailRow = null;
    resultsOpen = false;
    await tick();
    await nextFrame();
    try {
      rows = runMethodComparison(model, selected, {
        gaHyper,
        gaPreset,
        dlnHyper,
        dlnPreset,
      });
    } finally {
      busy = false;
    }
    if (!rows.length) {
      resultsMounted = false;
      return;
    }
    resultsMounted = true;
    await tick();
    await nextFrame();
    resultsOpen = true;
  }

  function bestOf(key: "Z" | "durationMs" | "gap" | "maxAbsDx"): number | null {
    const vals = rows
      .filter((r) => r.ok && r.result)
      .map((r) => {
        if (key === "Z") return r.result!.Z;
        if (key === "durationMs") return r.durationMs;
        if (key === "gap") return r.gap;
        return r.maxAbsDx;
      })
      .filter((v) => Number.isFinite(v));
    if (!vals.length) return null;
    if (key === "Z") return Math.max(...vals);
    return Math.min(...vals);
  }

  const overlayTrace = $derived.by((): SolveTrace | null => {
    const nativeLp = rows.find((r) => r.config.id === "lp:native" && r.trace);
    return nativeLp?.trace ?? null;
  });
</script>

<Card>
  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
    <div>
      <h3 class="text-sm font-medium text-text">{t("compareMethods")}</h3>
      <p class="mt-1 text-xs text-text-muted">{t("compareMethodsHint")}</p>
    </div>
    <Button disabled={busy || selected.length === 0} onclick={run}
      >{t("compareMethodsRun")}</Button
    >
  </div>

  <p class="mb-2 text-xs font-medium text-text-muted">
    {t("compareSelectConfigs")}
  </p>
  <div class="mb-4 flex flex-wrap gap-3">
    {#each configs as c (c.id)}
      <label class="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          class="accent-brand"
          checked={selected.includes(c.id)}
          disabled={c.required}
          onchange={() => toggle(c.id, c.required)}
        />
        {c.label}
        {#if c.required}
          <span class="text-xs text-text-faint">({t("compareBaseline")})</span>
        {/if}
      </label>
    {/each}
  </div>

  {#if resultsMounted}
    <div
      class={[
        "grid transition-[grid-template-rows] duration-[320ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
        prefersReducedMotion.current && "transition-none",
      ]}
      style:grid-template-rows={resultsOpen ? "1fr" : "0fr"}
    >
      <div class="min-h-0 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-border text-text-muted">
                <th class="py-2 pr-3">Конфиг</th>
                <th class="py-2 pr-3 text-right">Z</th>
                <th class="py-2 pr-3 text-right">{t("compareDeltaZ")}</th>
                <th class="py-2 pr-3 text-right">{t("compareGap")}</th>
                <th class="py-2 pr-3 text-right">{t("compareDuration")}</th>
                <th class="py-2 pr-3 text-right">{t("compareFeasible")}</th>
                <th class="py-2 pr-3 text-right">{t("comparePlanDelta")}</th>
                <th class="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {#each rows as row (row.config.id)}
                {@const zBest = bestOf("Z")}
                {@const dBest = bestOf("durationMs")}
                <tr class="border-b border-border-soft">
                  <td class="py-2 pr-3">
                    {row.config.label}
                    {#if row.config.required}
                      <span class="text-xs text-text-faint"
                        >· {t("compareBaseline")}</span
                      >
                    {/if}
                  </td>
                  {#if !row.ok}
                    <td
                      class="py-2 pr-3 text-right text-danger-text"
                      colspan="6">{t("compareFailed")}: {row.error}</td
                    >
                    <td></td>
                  {:else}
                    <td
                      class="py-2 pr-3 text-right font-mono tabular-nums {zBest !=
                        null &&
                      row.result &&
                      Math.abs(row.result.Z - zBest) < 1e-6
                        ? 'text-brand font-medium'
                        : ''}"
                    >
                      {formatPlanNumber(row.result!.Z)}
                    </td>
                    <td
                      class="py-2 pr-3 text-right font-mono tabular-nums text-text-muted"
                    >
                      {formatPlanNumber(row.deltaZ)}
                    </td>
                    <td class="py-2 pr-3 text-right font-mono tabular-nums">
                      {(row.gap * 100).toFixed(2)}%
                    </td>
                    <td
                      class="py-2 pr-3 text-right font-mono tabular-nums {dBest !=
                        null && Math.abs(row.durationMs - dBest) < 0.5
                        ? 'text-brand font-medium'
                        : ''}"
                    >
                      {row.durationMs.toFixed(1)} ms
                    </td>
                    <td class="py-2 pr-3 text-right">
                      {row.result!.feasible ? t("compareYes") : t("compareNo")}
                    </td>
                    <td class="py-2 pr-3 text-right font-mono tabular-nums">
                      {formatPlanNumber(row.maxAbsDx)}
                    </td>
                    <td class="py-2 text-right">
                      {#if row.trace && row.config.engine === "native"}
                        <button
                          type="button"
                          class="cursor-pointer text-xs text-brand underline-offset-2 hover:underline"
                          onclick={() =>
                            (detailRow =
                              detailRow?.config.id === row.config.id
                                ? null
                                : row)}
                        >
                          {t("compareShowDetails")}
                        </button>
                      {/if}
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="mt-2 text-xs text-text-soft">{t("compareAltOptima")}</p>

        <label class="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            class="accent-brand"
            bind:checked={showOverlay}
          />
          {t("compareOverlay")}
        </label>

        {#if showOverlay && overlayTrace}
          <div class="mt-3">
            <GeometryPanel {model} trace={overlayTrace} method="lp" compact />
          </div>
          <!-- Overlay markers via compare points — GeometryPanel shows LP trajectory;
			     individual method results listed in table. -->
          <ul class="mt-2 flex flex-wrap gap-2 text-xs">
            {#each rows.filter((r) => r.ok && r.result) as r (r.config.id)}
              <li
                class="rounded-full border border-border px-2 py-0.5 font-mono"
              >
                {r.config.label}: Z={formatPlanNumber(r.result!.Z)}
              </li>
            {/each}
          </ul>
        {/if}

        {#if detailRow?.trace}
          <div class="mt-4 border-t border-border pt-4">
            <p class="mb-2 text-sm font-medium">{detailRow.config.label}</p>
            {#if detailRow.trace.method === "lp"}
              <SimplexStepsPanel trace={detailRow.trace} />
            {:else if detailRow.trace.method === "ga"}
              <GaStepsPanel
                {model}
                trace={detailRow.trace}
                lpOptimum={rows.find((r) => r.config.id === "lp:native")
                  ?.result ?? null}
                gapVsLp={detailRow.response?.solver_meta.gap_vs_lp ?? null}
              />
            {:else}
              <p class="text-sm text-text-muted">{t("solveDetailsEmpty")}</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</Card>
