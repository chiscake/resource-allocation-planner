<script lang="ts">
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Angles4Controls from "$lib/components/model/visualization/Angles4Controls.svelte";
  import SceneCanvas from "$lib/components/model/visualization/SceneCanvas.svelte";
  import { buildLpScene } from "$lib/components/model/visualization/lp-adapter";
  import {
    DEFAULT_ANGLES4,
    type Angles4,
  } from "$lib/components/model/visualization/math";
  import { SCHEMA_VERSION, type Model } from "$lib/domain";
  import type {
    OptimizationScene,
    SceneViewDebug,
  } from "$lib/components/model/visualization/types";

  type DemoId = "cube" | "cutTesseract";

  let active = $state<DemoId | null>(null);
  let autoRotate = $state(true);
  let angles4 = $state<Angles4>({ ...DEFAULT_ANGLES4 });
  let viewDebug = $state<SceneViewDebug | null>(null);
  let copyStatus = $state<string | null>(null);

  /** Unit cube [0,1]³ as feasible region: x,y,z ≤ 1 plus nonnegativity. */
  function cubeModel(): Model {
    return {
      schema_version: SCHEMA_VERSION,
      products: ["x", "y", "z"],
      resources: ["x ≤ 1", "y ≤ 1", "z ≤ 1"],
      A: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      b: [1, 1, 1],
      c: [0, 0, 0],
    };
  }

  /**
   * Truncated / skewed 4-cube in the first orthant:
   * unit box + sum slab + asymmetric pairwise cuts.
   * Yields ~50 vertices / ~100 edges under project4d.
   */
  function cutTesseractModel(): Model {
    return {
      schema_version: SCHEMA_VERSION,
      products: ["x", "y", "z", "w"],
      resources: [
        "x ≤ 1",
        "y ≤ 1",
        "z ≤ 1",
        "w ≤ 1",
        "x+y+z+w ≤ 2.8",
        "x+y+z+w ≥ 1.2",
        "x+y ≤ 1.5",
        "z+w ≤ 1.5",
        "x+z ≤ 1.6",
        "y+w ≤ 1.6",
        "x+w ≤ 1.55",
        "y+z ≤ 1.55",
      ],
      A: [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
        [1, 1, 1, 1],
        [-1, -1, -1, -1],
        [1, 1, 0, 0],
        [0, 0, 1, 1],
        [1, 0, 1, 0],
        [0, 1, 0, 1],
        [1, 0, 0, 1],
        [0, 1, 1, 0],
      ],
      b: [1, 1, 1, 1, 2.8, -1.2, 1.5, 1.5, 1.6, 1.6, 1.55, 1.55],
      c: [0, 0, 0, 0],
    };
  }

  const scene = $derived.by((): OptimizationScene | null => {
    if (active === "cube") {
      return buildLpScene(cubeModel(), null, {
        mode: "exact3d",
        axisX: 0,
        axisY: 1,
        axisZ: 2,
      });
    }
    if (active === "cutTesseract") {
      return buildLpScene(cutTesseractModel(), null, {
        mode: "project4d",
        axisX: 0,
        axisY: 1,
        axisZ: 2,
      });
    }
    return null;
  });

  const demos: { id: DemoId; label: string; hint: string }[] = [
    { id: "cube", label: "Куб (ОДР [0,1]³)", hint: "exact3d" },
    {
      id: "cutTesseract",
      label: "4D: срезанный гиперкуб",
      hint: "project4d · ~52 верш.",
    },
  ];

  const debugText = $derived.by(() => {
    if (!viewDebug) return "";
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    const payload = {
      projection: viewDebug.projection,
      rotationMode: viewDebug.rotationMode,
      zoom: round(viewDebug.zoom),
      pan: { x: round(viewDebug.panX), y: round(viewDebug.panY) },
      lookFrom: viewDebug.lookFrom.map(round),
      quat: {
        w: round(viewDebug.quat[0]),
        x: round(viewDebug.quat[1]),
        y: round(viewDebug.quat[2]),
        z: round(viewDebug.quat[3]),
        raw: viewDebug.quat.map(round),
      },
      angles4: Object.fromEntries(
        Object.entries(viewDebug.angles4).map(([k, v]) => [k, round(v)]),
      ),
      axisW: viewDebug.axisW
        ? Object.fromEntries(
            Object.entries(viewDebug.axisW).map(([k, v]) => [k, round(v)]),
          )
        : undefined,
      rot4: viewDebug.rot4?.map(round),
    };
    return JSON.stringify(payload, null, 2);
  });

  async function copyDebug() {
    if (!debugText) return;
    try {
      await navigator.clipboard.writeText(debugText);
      copyStatus = "Скопировано";
    } catch {
      copyStatus = "Не удалось скопировать";
    }
    window.setTimeout(() => {
      copyStatus = null;
    }, 1600);
  }
</script>

<svelte:head>
  <title>Тест 3D-визуализатора — Планировщик распределения ресурсов</title>
</svelte:head>

<div class="mb-4">
  <a
    href="/app/test"
    class="text-xs text-brand underline-offset-2 hover:underline"
    >← Тестовые наработки</a
  >
</div>

<PageHeader
  title="3D / 4D-визуализатор"
  description="Слева сценарии отрисовки, справа SceneCanvas. 3D — ОДР через halfspaces; 4D — перспектива с вращением в плоскостях xw/yw/zw."
/>

<div class="mt-6 flex min-h-[480px] flex-col gap-4 lg:flex-row">
  <aside class="flex w-full shrink-0 flex-col gap-2 lg:w-56">
    {#each demos as demo (demo.id)}
      <Button
        variant={active === demo.id ? "primary" : "secondary"}
        class="w-full justify-start"
        onclick={() => {
          active = demo.id;
        }}
      >
        <span class="flex flex-col items-start gap-0.5 text-left">
          <span>{demo.label}</span>
          <span class="text-[10px] font-normal opacity-70">{demo.hint}</span>
        </span>
      </Button>
    {/each}
    {#if active}
      <label class="mt-2 flex items-center gap-2 text-xs text-text-muted">
        <input
          type="checkbox"
          class="size-4 accent-brand"
          bind:checked={autoRotate}
        />
        Автоповорот
      </label>
      {#if active === "cutTesseract"}
        <div class="mt-2 rounded-[6px] border border-border bg-bg-soft p-2">
          <Angles4Controls
            bind:angles4
            onChange={() => {
              autoRotate = false;
            }}
          />
        </div>
      {/if}
      <Button
        variant="ghost"
        class="w-full justify-start"
        onclick={() => {
          active = null;
          viewDebug = null;
          angles4 = { ...DEFAULT_ANGLES4 };
        }}
      >
        Очистить
      </Button>
    {/if}
  </aside>

  <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
    <Card class="flex min-h-[420px] flex-1 flex-col">
      {#if scene}
        <div class="flex min-h-[400px] flex-1 flex-col">
          <SceneCanvas
            {scene}
            stepIndex={0}
            bind:autoRotate
            bind:angles4
            bind:viewDebug
            fill
            plotClass="min-h-[400px] flex-1"
          />
        </div>
      {:else}
        <p
          class="flex min-h-[400px] flex-1 items-center justify-center text-sm text-text-muted"
        >
          Выберите сценарий слева.
        </p>
      {/if}
    </Card>

    {#if scene && debugText}
      <Card class="p-3">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-medium text-text">Метаданные вида</h3>
          <div class="flex items-center gap-2">
            {#if copyStatus}
              <span class="text-xs text-text-muted">{copyStatus}</span>
            {/if}
            <Button variant="secondary" class="text-xs" onclick={copyDebug}>
              Копировать JSON
            </Button>
          </div>
        </div>
        <textarea
          class="h-56 w-full resize-y rounded-[6px] border border-border bg-bg-soft p-2 font-mono text-[11px] leading-relaxed text-text"
          readonly
          spellcheck="false"
          value={debugText}
          onclick={(e) => (e.currentTarget as HTMLTextAreaElement).select()}
          aria-label="Метаданные вида (JSON)"
        ></textarea>
        <p class="mt-1.5 text-[11px] text-text-muted">
          Клик по полю — выделить всё. В 4D смотрите axisW / rot4: w-кольца
          на гизмо — скрытая компонента (сплошное = +w, пунктир = −w).
        </p>
      </Card>
    {/if}
  </div>
</div>
