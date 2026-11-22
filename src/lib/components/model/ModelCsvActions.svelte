<script lang="ts">
  import { Download, FileSpreadsheet, FileUp } from '@lucide/svelte';
  import type { Model } from '$lib/domain';
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';
  import InlineAlert from '$lib/components/ui/InlineAlert.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { csvModelTemplate, parseModelCsv, serializeModelCsv } from '$lib/io/csv-model';
  import { downloadCsv, safeFilename } from '$lib/io/download';

  let {
    model,
    title = '',
    disabled = false,
    onimport,
  }: {
    model: Model;
    title?: string;
    disabled?: boolean;
    onimport: (next: Model) => void;
  } = $props();

  let fileInput: HTMLInputElement | undefined = $state();
  let error = $state('');
  let pending = $state<{ model: Model; file: string } | null>(null);
  let confirmOpen = $state(false);

  function pickFile() {
    error = '';
    fileInput?.click();
  }

  async function onFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      error = t('csvReadFailed');
      return;
    }
    const res = parseModelCsv(text);
    if (!res.ok) {
      error = t(res.error, res.vars);
      return;
    }
    pending = {
      model: { ...res.model, what_if_defaults: model.what_if_defaults },
      file: file.name,
    };
    confirmOpen = true;
  }

  function applyImport() {
    if (!pending) return;
    onimport(pending.model);
    pending = null;
    confirmOpen = false;
  }

  function cancelImport() {
    pending = null;
    confirmOpen = false;
  }

  function downloadTemplate() {
    downloadCsv(csvModelTemplate(), 'template.csv');
  }

  function downloadModel() {
    downloadCsv(serializeModelCsv(model), safeFilename(title, 'csv'));
  }
</script>

<div class="flex flex-wrap items-center gap-2">
  <Button
    variant="secondary"
    class="px-3! py-1.5! text-xs!"
    {disabled}
    title={t('csvImportHint')}
    onclick={pickFile}
  >
    <FileUp size={14} strokeWidth={1.75} aria-hidden="true" />
    <span class="ml-1.5">{t('csvImport')}</span>
  </Button>
  <Button variant="ghost" class="px-3! py-1.5! text-xs!" onclick={downloadModel}>
    <Download size={14} strokeWidth={1.75} aria-hidden="true" />
    <span class="ml-1.5">{t('csvExportModel')}</span>
  </Button>
  <Button variant="ghost" class="px-3! py-1.5! text-xs!" onclick={downloadTemplate}>
    <FileSpreadsheet size={14} strokeWidth={1.75} aria-hidden="true" />
    <span class="ml-1.5">{t('csvTemplate')}</span>
  </Button>
  <input
    bind:this={fileInput}
    type="file"
    accept=".csv,text/csv,text/plain"
    class="hidden"
    onchange={onFileChange}
  />
</div>

{#if error}
  <div class="mt-3 w-full">
    <InlineAlert>{error}</InlineAlert>
  </div>
{/if}

<Modal bind:open={confirmOpen} title={t('csvImportConfirmTitle')} onclose={cancelImport}>
  {#if pending}
    <p class="text-sm text-text-muted">
      {t('csvImportConfirmBody', {
        file: pending.file,
        m: String(pending.model.resources.length),
        n: String(pending.model.products.length),
      })}
    </p>
  {/if}
  <div class="mt-6 flex justify-end gap-2">
    <Button variant="ghost" onclick={cancelImport}>{t('cancel')}</Button>
    <Button onclick={applyImport}>{t('csvImportApply')}</Button>
  </div>
</Modal>
