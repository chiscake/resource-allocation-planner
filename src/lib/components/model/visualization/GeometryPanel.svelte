<script lang="ts">
  import type { Model, SolveResult, SolveTrace } from "$lib/domain";
  import Card from "$lib/components/ui/Card.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import { buildGaScene } from "./ga-adapter";
  import { buildLpScene } from "./lp-adapter";
  import Angles4Controls from "./Angles4Controls.svelte";
  import SceneCanvas from "./SceneCanvas.svelte";
  import StepTimeline from "./StepTimeline.svelte";
  import { DEFAULT_ANGLES4, type Angles4 } from "./math";
  import type { ProjectionMode } from "./types";
  import { t } from "$lib/i18n";

  let {
    model,
    trace,
    method,
    lpOptimum = null,
    compact = false,
    /** When false, omit the panel h3 (e.g. outer toggle already names the section). */
    showTitle = true,
  }: {
    model: Model;
    trace: SolveTrace | null;
    method: "lp" | "ga" | "ipm";
    lpOptimum?: SolveResult | null;
    compact?: boolean;
    showTitle?: boolean;
  } = $props();

  const dim = $derived(model.products.length);

  let mode = $state<string>("exact2d");
  let axisX = $state(0);
  let axisY = $state(1);
  let axisZ = $state(2);
  let sectionAxis = $state(0);
  let sectionValue = $state(0);
  let stepIndex = $state(0);
  let playing = $state(false);
  let expanded = $state(false);
  let autoRotate = $state(false);
  let angles4 = $state<Angles4>({ ...DEFAULT_ANGLES4 });
  let metricsOpen = $state(false);

  $effect(() => {
    void method;
    void dim;
    if (dim <= 2) mode = "exact2d";
    else if (dim === 3) mode = "exact3d";
    else if (dim === 4) mode = "section3d";
    else mode = "selectedAxes";
    axisX = 0;
    axisY = Math.min(1, dim - 1);
    axisZ = Math.min(2, dim - 1);
    sectionAxis = Math.max(0, dim - 1);
    playing = false;
  });

  const scene = $derived.by(() => {
    const m = mode as ProjectionMode;
    if (method === "ga" && trace?.method === "ga") {
      return buildGaScene(model, trace, {
        mode: m,
        axisX,
        axisY,
        axisZ,
        sectionAxis,
        sectionValue,
        lpOptimum,
      });
    }
    if (method === "lp" && (trace?.method === "lp" || !trace)) {
      return buildLpScene(model, trace?.method === "lp" ? trace : null, {
        mode: m,
        axisX,
        axisY,
        axisZ,
        sectionAxis,
        sectionValue,
      });
    }
    return buildLpScene(model, null, { mode: m, axisX, axisY, axisZ });
  });

  const maxIndex = $derived(Math.max(0, scene.frames.length - 1));
  const frame = $derived(scene.frames[Math.min(stepIndex, maxIndex)]);

  // Jump to latest frame when the number of frames changes (new solve / rebuild).
  let lastFrameCount = $state(-1);
  $effect(() => {
    const len = scene.frames.length;
    if (len !== lastFrameCount) {
      lastFrameCount = len;
      stepIndex = Math.max(0, len - 1);
    }
  });

  // Keep 4D section near the middle of the axis so the cloud is not empty.
  let lastSectionKey = $state("");
  $effect(() => {
    if (mode !== "section3d") return;
    const key = `${sectionAxis}:${scene.bounds.min[sectionAxis]}:${scene.bounds.max[sectionAxis]}`;
    if (key === lastSectionKey) return;
    lastSectionKey = key;
    const mn = scene.bounds.min[sectionAxis] ?? 0;
    const mx = scene.bounds.max[sectionAxis] ?? 1;
    sectionValue = (mn + mx) / 2;
  });

  const modeOptions = $derived.by(() => {
    const opts: { value: string; label: string }[] = [];
    if (dim <= 2) opts.push({ value: "exact2d", label: t("vizMode2d") });
    if (dim >= 3) opts.push({ value: "exact3d", label: t("vizMode3d") });
    if (dim >= 4) {
      opts.push({ value: "section3d", label: t("vizModeSection") });
      opts.push({ value: "project4d", label: t("vizMode4d") });
    }
    if (dim > 2) opts.push({ value: "selectedAxes", label: t("vizModeAxes") });
    if (dim > 4) {
      opts.push({ value: "pca", label: t("vizModePca") });
      opts.push({ value: "parallel", label: t("vizModeParallel") });
    }
    return opts;
  });

  const productOptions = $derived(
    model.products.map((p, i) => ({ value: String(i), label: p })),
  );

  function collapse() {
    expanded = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && expanded) {
      e.preventDefault();
      collapse();
    }
  }

  $effect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  });
</script>

<svelte:window onkeydown={onKeydown} />

{#if expanded}
  <button
    type="button"
    class="fixed inset-0 z-40 cursor-default border-0 bg-[rgba(10,10,10,0.5)] p-0"
    aria-label={t("geometryCollapse")}
    onclick={collapse}
  ></button>
{/if}

<Card
  class="flex flex-col{expanded
    ? ' fixed inset-4 z-50 overflow-hidden shadow-xl'
    : ''}"
>
  <div
    class="mb-3 flex shrink-0 flex-wrap items-center gap-2{showTitle
      ? ' justify-between'
      : ' justify-end'}"
  >
    {#if showTitle}
      <h3 class="text-sm font-medium text-text">{t("geometryTitle")}</h3>
    {/if}
    <button
      type="button"
      class="cursor-pointer text-xs text-brand underline-offset-2 hover:underline"
      onclick={() => (expanded = !expanded)}
    >
      {expanded ? t("geometryCollapse") : t("geometryExpand")}
    </button>
  </div>

  <div
    class="shrink-0{expanded
      ? ' max-h-[36%] overflow-y-auto overscroll-contain pr-1'
      : ''}"
  >
    <div class="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label class="text-xs text-text-muted">
        <span class="mb-1 block">{t("vizProjection")}</span>
        <Select bind:value={mode} options={modeOptions} />
      </label>
      {#if mode === "selectedAxes" || mode === "section3d" || mode === "exact2d" || mode === "exact3d"}
        <label class="text-xs text-text-muted">
          <span class="mb-1 block">X</span>
          <Select
            value={String(axisX)}
            options={productOptions}
            oninput={(e) => (axisX = Number(e.currentTarget.value))}
          />
        </label>
        <label class="text-xs text-text-muted">
          <span class="mb-1 block">Y</span>
          <Select
            value={String(axisY)}
            options={productOptions}
            oninput={(e) => (axisY = Number(e.currentTarget.value))}
          />
        </label>
        {#if dim >= 3 && mode !== "exact2d"}
          <label class="text-xs text-text-muted">
            <span class="mb-1 block">Z</span>
            <Select
              value={String(axisZ)}
              options={productOptions}
              oninput={(e) => (axisZ = Number(e.currentTarget.value))}
            />
          </label>
        {/if}
      {/if}
      {#if mode === "section3d" && dim >= 4}
        <label class="text-xs text-text-muted">
          <span class="mb-1 block">{t("vizSectionAxis")}</span>
          <Select
            value={String(sectionAxis)}
            options={productOptions}
            oninput={(e) => (sectionAxis = Number(e.currentTarget.value))}
          />
        </label>
        <label class="text-xs text-text-muted">
          <span class="mb-1 block">{t("vizSectionValue")}</span>
          <input
            type="range"
            class="mt-2 w-full accent-brand"
            min={scene.bounds.min[sectionAxis] ?? 0}
            max={scene.bounds.max[sectionAxis] ?? 1}
            step="0.01"
            bind:value={sectionValue}
          />
        </label>
      {/if}
      {#if mode === "exact3d" || mode === "project4d" || mode === "section3d"}
        <label
          class="flex h-[42px] items-center gap-2 self-end text-xs text-text-muted"
        >
          <input
            type="checkbox"
            class="size-4 accent-brand"
            bind:checked={autoRotate}
          />
          {t("vizAutoRotate")}
        </label>
      {/if}
      {#if mode === "project4d" && dim >= 4}
        <Angles4Controls
          bind:angles4
          onChange={() => {
            autoRotate = false;
          }}
        />
      {/if}
    </div>

    <StepTimeline
      bind:index={stepIndex}
      {maxIndex}
      bind:playing
      label={frame?.stepLabel ?? ""}
    />
  </div>

  <div class="mt-3 flex flex-col gap-2{expanded ? ' min-h-0 flex-1' : ''}">
    <SceneCanvas
      {scene}
      {stepIndex}
      objectiveCoefficients={model.c}
      bind:autoRotate
      bind:angles4
      fill={expanded}
      plotClass={expanded
        ? "min-h-[200px] flex-1"
        : compact
          ? "h-[min(70dvh,420px)] min-h-[240px] shrink-0"
          : "h-[min(70dvh,560px)] min-h-[320px] shrink-0"}
    />
  </div>

  {#if frame?.metrics}
    <div class="mt-3 shrink-0">
      <button
        type="button"
        class="cursor-pointer text-xs font-medium text-text-muted underline-offset-2 hover:text-text hover:underline"
        aria-expanded={metricsOpen}
        onclick={() => (metricsOpen = !metricsOpen)}
      >
        {metricsOpen ? t("vizMetricsHide") : t("vizMetrics")}
      </button>
      {#if metricsOpen}
        <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          {#each Object.entries(frame.metrics) as [k, v] (k)}
            <div
              class="flex justify-between gap-2 border-b border-border-soft py-1"
            >
              <dt class="text-text-muted">{k}</dt>
              <dd class="font-mono tabular-nums text-text">
                {typeof v === "number" && Number.isFinite(v) ? v.toFixed(4) : v}
              </dd>
            </div>
          {/each}
        </dl>
      {/if}
    </div>
  {/if}
</Card>
