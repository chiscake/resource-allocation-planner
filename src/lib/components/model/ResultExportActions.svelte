<script lang="ts">
  import { FileSpreadsheet, FileText } from "@lucide/svelte";
  import type {
    Model,
    SolveMethod,
    SolveResult,
    WhatIfRowData,
  } from "$lib/domain";
  import { t } from "$lib/i18n";
  import Button from "$lib/components/ui/Button.svelte";
  import { downloadBlob } from "$lib/io/download";

  let {
    title,
    method,
    result,
    model,
    whatIfRows = [],
    roundPlan = false,
    solverLibrary = null,
  }: {
    title: string;
    method: SolveMethod;
    result: SolveResult;
    model: Model;
    whatIfRows?: WhatIfRowData[];
    roundPlan?: boolean;
    solverLibrary?: string | null;
  } = $props();

  let busy = $state<"xlsx" | "pdf" | null>(null);
  let error = $state("");

  function payload() {
    return {
      title,
      method,
      result,
      model,
      whatIfRows,
      roundPlan,
      solverLibrary,
      solvedAt: new Date(),
    };
  }

  async function run(kind: "xlsx" | "pdf") {
    busy = kind;
    error = "";
    try {
      const io = await import("$lib/io/export-result");
      const file =
        kind === "xlsx"
          ? await io.buildExcelBlob(payload())
          : io.buildPdfBlob(
              payload(),
              await (await import("$lib/io/pdf-fonts")).loadPdfFonts(),
            );
      downloadBlob(file.blob, file.filename);
    } catch (e) {
      console.error(e);
      error = t("exportFailed");
    } finally {
      busy = null;
    }
  }
</script>

<div class="flex flex-col items-end gap-1">
  <div
    class="inline-flex items-center gap-1"
    role="group"
    aria-label={t("exportResult")}
    title={t("exportHint")}
  >
    <span class="mr-1 text-xs text-text-soft">{t("exportResult")}</span>
    <Button
      variant="secondary"
      class="!px-2.5 !py-1.5 !text-xs"
      disabled={busy !== null}
      onclick={() => void run("xlsx")}
    >
      <FileSpreadsheet size={14} strokeWidth={1.75} aria-hidden="true" />
      <span class="ml-1.5">{busy === "xlsx" ? t("loading") : t("exportExcel")}</span>
    </Button>
    <Button
      variant="secondary"
      class="!px-2.5 !py-1.5 !text-xs"
      disabled={busy !== null}
      onclick={() => void run("pdf")}
    >
      <FileText size={14} strokeWidth={1.75} aria-hidden="true" />
      <span class="ml-1.5">{busy === "pdf" ? t("loading") : t("exportPdf")}</span>
    </Button>
  </div>
  {#if error}
    <p class="text-xs text-danger-text">{error}</p>
  {/if}
</div>
