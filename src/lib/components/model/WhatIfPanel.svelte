<script lang="ts">
  import { t } from "$lib/i18n";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import WhatIfTableBody from "./WhatIfTableBody.svelte";
  import type { WhatIfRow } from "./solve-session.svelte";
  import type { WhatIfRowData } from "$lib/domain";

  let {
    rows,
    generationIndex = 0,
    generationCount = 1,
    onGenerationChange,
    activeHint,
    archiveHint,
    onCreateTaskFromScenario,
  }: {
    rows: WhatIfRow[];
    generationIndex?: number;
    generationCount?: number;
    onGenerationChange?: (index: number) => void;
    activeHint?: string;
    archiveHint?: string;
    onCreateTaskFromScenario?: (row: WhatIfRowData) => void;
  } = $props();

  const showPager = $derived(generationCount > 1);
  const hint = $derived(
    showPager
      ? generationIndex >= generationCount - 1
        ? (activeHint ?? t("generationActiveHint"))
        : (archiveHint ?? "")
      : null,
  );

  /** Remount body when the row set / generation changes → clears multi-expand. */
  const rowsFingerprint = $derived(
    `${generationIndex}|` +
      rows
        .map((r, i) =>
          r.mutation
            ? `${r.mutation.kind}:${r.mutation.target}:${r.mutation.delta}`
            : `i:${i}:${r.title}`,
        )
        .join(";"),
  );
</script>

{#if rows.length}
  <Card>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-medium">{t("whatIf")}</h2>
      {#if showPager && onGenerationChange}
        <div class="flex items-center gap-3">
          <Button
            variant="ghost"
            class="!px-2 !py-1"
            disabled={generationIndex <= 0}
            onclick={() => onGenerationChange(generationIndex - 1)}>←</Button
          >
          <span class="font-mono text-sm"
            >{generationIndex + 1}/{generationCount}</span
          >
          <Button
            variant="ghost"
            class="!px-2 !py-1"
            disabled={generationIndex >= generationCount - 1}
            onclick={() => onGenerationChange(generationIndex + 1)}>→</Button
          >
        </div>
      {/if}
    </div>
    {#if hint}
      <p class="mb-3 text-xs text-text-soft">{hint}</p>
    {/if}

    {#key rowsFingerprint}
      <WhatIfTableBody {rows} {onCreateTaskFromScenario} />
    {/key}
  </Card>
{/if}
