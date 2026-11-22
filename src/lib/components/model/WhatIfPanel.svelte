<script lang="ts">
  import { t } from "$lib/i18n";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import LpModelMatrix from "./LpModelMatrix.svelte";
  import WhatIfTableBody from "./WhatIfTableBody.svelte";
  import type { WhatIfRow } from "./solve-session.svelte";
  import type { Model, WhatIfRowData } from "$lib/domain";
  import type { WhatIfBadge } from "$lib/domain/whatif-generation";

  let {
    rows,
    generationIndex = 0,
    generationCount = 1,
    onGenerationChange,
    activeHint,
    archiveHint,
    badge = null,
    emptyMessage = null,
    baseModel = null,
    showRestore = false,
    onRestore,
    onCreateTaskFromScenario,
  }: {
    rows: WhatIfRow[];
    generationIndex?: number;
    generationCount?: number;
    onGenerationChange?: (index: number) => void;
    activeHint?: string;
    archiveHint?: string;
    badge?: WhatIfBadge | null;
    /** When set, show instead of the table (empty current step). */
    emptyMessage?: string | null;
    /** Source LP table snapshot for this generation (readonly). */
    baseModel?: Model | null;
    showRestore?: boolean;
    onRestore?: () => void;
    onCreateTaskFromScenario?: (row: WhatIfRowData) => void;
  } = $props();

  const showPager = $derived(generationCount > 1);
  const showPanel = $derived(
    rows.length > 0 || Boolean(emptyMessage) || showPager,
  );
  const hint = $derived(
    emptyMessage
      ? null
      : showPager
        ? badge === "current"
          ? (activeHint ?? t("generationActiveHint"))
          : (archiveHint ?? "")
        : badge === "current"
          ? (activeHint ?? t("generationActiveHint"))
          : null,
  );
  const badgeLabel = $derived(
    badge === "current"
      ? t("whatIfBadgeCurrent")
      : badge === "past"
        ? t("whatIfBadgePast")
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

{#if showPanel}
  <Card>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-medium">{t("whatIf")}</h2>
        {#if badgeLabel}
          <span
            class={[
              "rounded-md px-2 py-0.5 text-xs font-medium",
              badge === "current"
                ? "bg-brand-faint text-brand"
                : "bg-bg-soft text-text-muted",
            ]}
          >
            {badgeLabel}
          </span>
        {/if}
      </div>
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

    {#if emptyMessage}
      <p class="text-sm text-text-muted">{emptyMessage}</p>
    {:else if rows.length}
      {#if baseModel}
        <div class="mb-6">
          <div class="mb-2 flex flex-wrap items-center gap-3">
            <p class="text-sm font-medium text-text-muted">
              {t("whatIfBaseMatrix")}
            </p>
            {#if showRestore && onRestore}
              <Button
                variant="secondary"
                class="!px-3 !py-1.5 text-sm"
                onclick={onRestore}
              >
                {t("whatIfRestoreBase")}
              </Button>
            {/if}
          </div>
          {#key rowsFingerprint}
            <LpModelMatrix model={baseModel} readonly />
          {/key}
        </div>
      {/if}
      {#key rowsFingerprint}
        <WhatIfTableBody {rows} {onCreateTaskFromScenario} />
      {/key}
    {/if}
  </Card>
{/if}
