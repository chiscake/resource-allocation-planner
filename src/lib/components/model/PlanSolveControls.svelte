<script lang="ts">
  import type { GaRunConfig, Model, WhatIfDefaults } from "$lib/domain";
  import { Cloud } from "@lucide/svelte";
  import { t } from "$lib/i18n";
  import Tabs from "$lib/components/ui/Tabs.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import type { GaPresetId } from "$lib/solver/methods/ga/presets";
  import { GA_DEFAULT_SEED, GA_PRESET_DEFS } from "$lib/solver/methods/ga/presets";

  let {
    model,
    activeTab = $bindable("plan"),
    includeSensitivity = $bindable(false),
    gaPreset = $bindable<GaPresetId>("balanced"),
    gaConfig = $bindable<Partial<GaRunConfig>>({}),
    busy = false,
    showLoginCta = false,
    showCloudSplit = false,
    onWhatIfChange,
    onSolve,
    onSolveCloud,
  }: {
    model: Model;
    activeTab?: string;
    includeSensitivity?: boolean;
    gaPreset?: GaPresetId;
    gaConfig?: Partial<GaRunConfig>;
    busy?: boolean;
    showLoginCta?: boolean;
    showCloudSplit?: boolean;
    onWhatIfChange: (field: keyof WhatIfDefaults, raw: string) => void;
    onSolve: () => void;
    onSolveCloud?: () => void;
  } = $props();

  const useCloudSplit = $derived(showCloudSplit && onSolveCloud != null);

  const tabItems = [
    { id: "plan", label: t("tabPlan") },
    { id: "ipm", label: t("tabIpm") },
    { id: "ga", label: t("tabGa") },
  ];

  const methodReady = $derived(
    activeTab === "plan" || activeTab === "ipm" || activeTab === "ga",
  );
  let randomSeed = $state(false);

  const presetOptions = [
    { value: "fast", label: t("gaPresetFast") },
    { value: "balanced", label: t("gaPresetBalanced") },
    { value: "precise", label: t("gaPresetPrecise") },
    { value: "custom", label: t("gaPresetCustom") },
  ];

  function pctToInput(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return "";
    return String(Math.round(v * 100));
  }

  function patchGa(partial: Partial<GaRunConfig>) {
    gaConfig = { ...gaConfig, ...partial };
    gaPreset = "custom";
  }

  const customDefaults = GA_PRESET_DEFS.balanced;
</script>

<div>
  <p class="mb-2 text-sm font-medium">{t("solveMethod")}</p>
  <Tabs items={tabItems} bind:active={activeTab} />
</div>

{#if activeTab === "plan"}
  <p class="mt-3 text-sm text-text-muted">{t("methodPlanHint")}</p>
{:else if activeTab === "ipm"}
  <p class="mt-3 text-sm text-text-muted">{t("methodIpmHint")}</p>
{:else if activeTab === "ga"}
  <p class="mt-3 text-sm text-text-muted">{t("methodGaHint")}</p>
  <div class="mt-3">
    <label for="ga-preset" class="mb-1 block text-sm text-text-muted"
      >{t("gaPreset")}</label
    >
    <div class="flex flex-wrap items-center gap-3">
      <div class="min-w-[14rem] flex-1 sm:max-w-xs">
        <Select id="ga-preset" bind:value={gaPreset} options={presetOptions} />
      </div>
      <label class="flex shrink-0 items-center gap-2 text-sm">
        <input
          type="checkbox"
          class="size-4 accent-brand"
          bind:checked={randomSeed}
          onchange={() => {
            gaConfig = {
              ...gaConfig,
              seed: randomSeed ? null : GA_DEFAULT_SEED,
            };
          }}
        />
        {t("gaSeedRandom")}
      </label>
    </div>
  </div>
  {#if gaPreset === "custom"}
    <div class="mt-3 grid gap-2 sm:grid-cols-3">
      <label class="text-sm">
        <span class="mb-1 block text-text-muted">{t("gaPopulation")}</span>
        <Input
          type="number"
          min="2"
          value={String(
            gaConfig.populationSize ?? customDefaults.populationSize ?? "",
          )}
          oninput={(e) =>
            patchGa({ populationSize: Number(e.currentTarget.value) || 60 })}
        />
      </label>
      <label class="text-sm">
        <span class="mb-1 block text-text-muted">{t("gaMaxGenerations")}</span>
        <Input
          type="number"
          min="1"
          value={String(
            gaConfig.maxGenerations ?? customDefaults.maxGenerations ?? "",
          )}
          oninput={(e) =>
            patchGa({ maxGenerations: Number(e.currentTarget.value) || 120 })}
        />
      </label>
      <label class="text-sm">
        <span class="mb-1 block text-text-muted">{t("gaStagnation")}</span>
        <Input
          type="number"
          min="1"
          value={String(
            gaConfig.stagnationGenerations ??
              customDefaults.stagnationGenerations ??
              "",
          )}
          oninput={(e) =>
            patchGa({
              stagnationGenerations: Number(e.currentTarget.value) || 25,
            })}
        />
      </label>
      <label class="text-sm">
        <span class="mb-1 block text-text-muted">{t("gaSeed")}</span>
        <Input
          type="number"
          disabled={randomSeed}
          value={String(gaConfig.seed ?? GA_DEFAULT_SEED)}
          oninput={(e) => patchGa({ seed: Number(e.currentTarget.value) })}
        />
      </label>
    </div>
  {/if}
{/if}

{#if methodReady}
  <label class="mt-3 flex items-center gap-2 text-sm">
    <input type="checkbox" bind:checked={includeSensitivity} />
    {t("whatIfEnable")}
  </label>

  {#if includeSensitivity}
    <div class="mt-3">
      <p class="mb-2 text-sm font-medium">{t("whatIfDefaults")}</p>
      <div class="grid gap-2 sm:grid-cols-3">
        <label class="text-sm">
          <span class="mb-1 block text-text-muted"
            >{t("whatIfResourcePct")}</span
          >
          <Input
            type="number"
            step="1"
            min="0"
            value={pctToInput(model.what_if_defaults?.resource_pct)}
            oninput={(e) =>
              onWhatIfChange("resource_pct", e.currentTarget.value)}
          />
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-text-muted"
            >{t("whatIfModernizationPct")}</span
          >
          <Input
            type="number"
            step="1"
            min="0"
            value={pctToInput(model.what_if_defaults?.modernization_pct)}
            oninput={(e) =>
              onWhatIfChange("modernization_pct", e.currentTarget.value)}
          />
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-text-muted">{t("whatIfPricePct")}</span>
          <Input
            type="number"
            step="1"
            min="0"
            value={pctToInput(model.what_if_defaults?.price_pct)}
            oninput={(e) => onWhatIfChange("price_pct", e.currentTarget.value)}
          />
        </label>
      </div>
    </div>
  {/if}

  <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
    {#if useCloudSplit}
      <p class="mr-auto flex items-center gap-1.5 text-xs text-text-muted">
        <Cloud size={14} strokeWidth={1.75} aria-hidden="true" />
        {t("solveCloudHint")}
      </p>
    {/if}
    {#if showLoginCta}
      <Button variant="secondary" href="/login">{t("loginAndSave")}</Button>
    {/if}
    {#if useCloudSplit}
      <div class="inline-flex overflow-hidden rounded-[8px]">
        <Button
          class="!rounded-none !rounded-l-[8px]"
          disabled={busy || !methodReady}
          onclick={onSolve}
        >
          {t("solve")}
        </Button>
        <button
          type="button"
          class="inline-flex cursor-pointer items-center justify-center border-l border-white/25 bg-accent px-3 py-2.5 text-white transition-colors duration-200 hover:bg-text-medium active:bg-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy || !methodReady}
          aria-label={t("solveCloudAria")}
          title={t("solveCloudAria")}
          onclick={() => onSolveCloud?.()}
        >
          <Cloud size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    {:else}
      <Button disabled={busy || !methodReady} onclick={onSolve}
        >{t("solve")}</Button
      >
    {/if}
  </div>
{/if}
