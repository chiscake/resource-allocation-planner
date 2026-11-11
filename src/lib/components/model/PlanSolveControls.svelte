<script lang="ts">
  import type {
    DlnRunConfig,
    GaRunConfig,
    Model,
    WhatIfDefaults,
  } from "$lib/domain";
  import { env } from "$env/dynamic/public";
  import { Cloud } from "@lucide/svelte";
  import { t } from "$lib/i18n";
  import { isDlnUiEnabled } from "$lib/features";
  import Tabs from "$lib/components/ui/Tabs.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import type { GaPresetId } from "$lib/solver/methods/ga/presets";
  import {
    GA_DEFAULT_SEED,
    GA_PRESET_DEFS,
  } from "$lib/solver/methods/ga/presets";
  import type { DlnPresetId } from "$lib/solver/methods/dln/presets";
  import { DLN_PRESET_DEFS } from "$lib/solver/methods/dln/presets";

  let {
    model,
    activeTab = $bindable("plan"),
    includeSensitivity = $bindable(false),
    gaPreset = $bindable<GaPresetId>("balanced"),
    gaConfig = $bindable<Partial<GaRunConfig>>({}),
    dlnPreset = $bindable<DlnPresetId>("precise"),
    dlnConfig = $bindable<Partial<DlnRunConfig>>({}),
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
    dlnPreset?: DlnPresetId;
    dlnConfig?: Partial<DlnRunConfig>;
    busy?: boolean;
    showLoginCta?: boolean;
    showCloudSplit?: boolean;
    onWhatIfChange: (field: keyof WhatIfDefaults, raw: string) => void;
    onSolve: () => void;
    onSolveCloud?: () => void;
  } = $props();

  const useCloudSplit = $derived(showCloudSplit && onSolveCloud != null);
  const showDln = isDlnUiEnabled(env.PUBLIC_SHOW_DLN);

  const tabItems = [
    { id: "plan", label: t("tabPlan") },
    { id: "ipm", label: t("tabIpm") },
    { id: "ga", label: t("tabGa") },
    ...(showDln ? [{ id: "dln", label: t("tabDln") }] : []),
  ];

  $effect(() => {
    if (!showDln && activeTab === "dln") activeTab = "plan";
  });

  const methodReady = $derived(
    activeTab === "plan" ||
      activeTab === "ipm" ||
      activeTab === "ga" ||
      (showDln && activeTab === "dln"),
  );
  let randomSeed = $state(false);

  const presetOptions = [
    { value: "fast", label: t("gaPresetFast") },
    { value: "balanced", label: t("gaPresetBalanced") },
    { value: "precise", label: t("gaPresetPrecise") },
    { value: "custom", label: t("gaPresetCustom") },
  ];

  const dlnPresetOptions = [
    { value: "fast", label: t("dlnPresetFast") },
    { value: "precise", label: t("dlnPresetPrecise") },
    { value: "custom", label: t("dlnPresetCustom") },
  ];

  function pctToInput(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return "";
    return String(Math.round(v * 100));
  }

  function patchGa(partial: Partial<GaRunConfig>) {
    gaConfig = { ...gaConfig, ...partial };
    gaPreset = "custom";
  }

  function patchDln(partial: Partial<DlnRunConfig>) {
    dlnConfig = { ...dlnConfig, ...partial };
    dlnPreset = "custom";
  }

  const customDefaults = GA_PRESET_DEFS.balanced;
  const dlnCustomDefaults = DLN_PRESET_DEFS.precise;
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
{:else if activeTab === "dln"}
  <p class="mt-3 text-sm text-text-muted">{t("methodDlnHint")}</p>
  <div class="mt-3">
    <label for="dln-preset" class="mb-1 block text-sm text-text-muted"
      >{t("dlnPreset")}</label
    >
    <div class="flex flex-wrap items-center gap-3">
      <div class="min-w-[14rem] flex-1 sm:max-w-xs">
        <Select
          id="dln-preset"
          bind:value={dlnPreset}
          options={dlnPresetOptions}
        />
      </div>
    </div>
  </div>
  {#if dlnPreset === "custom"}
    <div class="mt-3 grid gap-2 sm:grid-cols-4">
      <label class="text-sm">
        <span class="mb-1 block text-text-muted">{t("dlnLambda")}</span>
        <Input
          type="number"
          step="any"
          min="0.0001"
          value={String(dlnConfig.lambda ?? dlnCustomDefaults.lambda)}
          oninput={(e) =>
            patchDln({
              lambda: Number(e.currentTarget.value) || dlnCustomDefaults.lambda,
            })}
        />
      </label>
      <label class="text-sm">
        <span class="mb-1 block text-text-muted">{t("dlnKappa")}</span>
        <Input
          type="number"
          step="any"
          min="0.1"
          value={String(dlnConfig.kappa ?? dlnCustomDefaults.kappa)}
          oninput={(e) =>
            patchDln({
              kappa: Number(e.currentTarget.value) || dlnCustomDefaults.kappa,
            })}
        />
      </label>
      <label class="text-sm">
        <span class="mb-1 block text-text-muted">{t("dlnTol")}</span>
        <Input
          type="number"
          step="any"
          min="0"
          value={String(dlnConfig.tol ?? dlnCustomDefaults.tol)}
          oninput={(e) =>
            patchDln({
              tol: Number(e.currentTarget.value) || dlnCustomDefaults.tol,
            })}
        />
      </label>
      <label class="text-sm">
        <span class="mb-1 block text-text-muted">{t("dlnMaxIter")}</span>
        <Input
          type="number"
          min="1"
          step="1000"
          value={String(dlnConfig.maxIter ?? dlnCustomDefaults.maxIter)}
          oninput={(e) =>
            patchDln({
              maxIter:
                Math.max(1, Math.trunc(Number(e.currentTarget.value))) ||
                dlnCustomDefaults.maxIter,
            })}
        />
      </label>
    </div>
    <label class="mt-3 flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        class="size-4 accent-brand"
        checked={dlnConfig.rowScale ?? dlnCustomDefaults.rowScale}
        onchange={(e) => patchDln({ rowScale: e.currentTarget.checked })}
      />
      {t("dlnRowScale")}
    </label>
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
