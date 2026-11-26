<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Trash2 } from '@lucide/svelte';
  import { supabase } from '$lib/db/supabase';
  import { createBlankPersonalTemplate, useTemplateAndOpen } from '$lib/db/create-solve-node';
  import { softDeleteTemplate, restoreTemplate } from '$lib/db/soft-delete';
  import {
    isPublishedCatalog,
    isPublishPending,
    type PublishStatus,
  } from '$lib/db/template-publish';
  import type { Model } from '$lib/domain';
  import { t } from '$lib/i18n';
  import { optimisticDeleteWithUndo } from '$lib/ui/optimistic-delete';
  import TemplatePreviewCard from '$lib/components/TemplatePreviewCard.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import CardIconButton from '$lib/components/ui/CardIconButton.svelte';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import InlineAlert from '$lib/components/ui/InlineAlert.svelte';

  type Row = {
    id: string;
    title: string;
    model: Model | null;
    updated_at: string | null;
    system_kind: string | null;
    publish_status: PublishStatus;
  };

  let rows = $state<Row[]>([]);
  let busyId = $state<string | null>(null);
  let creating = $state(false);
  let msg = $state('');
  let okMsg = $state('');
  let confirmOpen = $state(false);
  let pendingDelete = $state<Row | null>(null);

  function sortByTitle(list: Row[]) {
    return [...list].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }

  async function reload() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      rows = [];
      return;
    }
    const { data } = await supabase
      .from('templates')
      .select('id, title, model, updated_at, system_kind, publish_status')
      .is('deleted_at', null)
      .eq('owner_id', auth.user.id)
      .or('system_kind.is.null,system_kind.eq.public_repo')
      .order('title');
    rows = (data ?? []) as Row[];
  }

  onMount(() => {
    void reload();
  });

  async function createTemplate() {
    if (creating || busyId) return;
    creating = true;
    msg = '';
    okMsg = '';
    const result = await createBlankPersonalTemplate();
    if ('error' in result) {
      msg = result.error || t('createTemplateFailed');
      creating = false;
      return;
    }
    await goto(`/app/templates/${result.id}?edit=1`);
    creating = false;
  }

  async function useTemplate(id: string) {
    if (busyId || creating) return;
    busyId = id;
    msg = '';
    okMsg = '';
    const err = await useTemplateAndOpen(id);
    if (err) msg = err.error || t('useFailed');
    busyId = null;
  }

  function requestDelete(row: Row) {
    if (busyId || creating) return;
    if (isPublishedCatalog(row)) {
      msg = t('publishLockedHint');
      return;
    }
    pendingDelete = row;
    confirmOpen = true;
  }

  async function deleteTemplate() {
    if (!pendingDelete || busyId || creating) return;
    const row = pendingDelete;
    if (isPublishedCatalog(row)) {
      msg = t('publishLockedHint');
      pendingDelete = null;
      return;
    }
    busyId = row.id;
    msg = '';
    okMsg = '';
    await optimisticDeleteWithUndo({
      item: row,
      removeOptimistic: () => {
        rows = rows.filter((r) => r.id !== row.id);
      },
      restoreOptimistic: (removed) => {
        rows = sortByTitle([...rows, removed]);
      },
      softDelete: () => softDeleteTemplate(row.id),
      restore: () => restoreTemplate(row.id),
    });
    busyId = null;
    pendingDelete = null;
  }
</script>

<section class="mx-auto flex max-w-5xl flex-col gap-6">
  <PageHeader title={t('templates')} description={t('templatesHint')}>
    {#snippet actions()}
      <Button variant="primary" disabled={creating || !!busyId} onclick={() => createTemplate()}>
        {creating ? t('creatingTemplate') : t('createTemplate')}
      </Button>
    {/snippet}
  </PageHeader>

  {#if msg}
    <InlineAlert>{msg}</InlineAlert>
  {/if}
  {#if okMsg}
    <p class="text-sm text-text-muted">{okMsg}</p>
  {/if}

  {#if rows.length === 0}
    <EmptyState title={t('noPersonalTemplates')}>
      {#snippet action()}
        <Button variant="primary" disabled={creating || !!busyId} onclick={() => createTemplate()}>
          {creating ? t('creatingTemplate') : t('createTemplate')}
        </Button>
      {/snippet}
    </EmptyState>
  {:else}
    <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each rows as r (r.id)}
        <li>
          <TemplatePreviewCard title={r.title} model={r.model} href="/app/templates/{r.id}">
            {#snippet titleBadge()}
              {#if isPublishPending(r)}
                <Badge variant="warning">{t('publishStatusPending')}</Badge>
              {:else if isPublishedCatalog(r)}
                <Badge variant="success">{t('publishStatusPublic')}</Badge>
              {/if}
            {/snippet}
            {#snippet actions()}
              <div class="flex w-full items-center gap-2">
                <Button
                  variant="primary"
                  class="px-3! py-1.5!"
                  disabled={busyId === r.id || creating}
                  onclick={() => useTemplate(r.id)}
                >
                  {busyId === r.id ? t('creatingTask') : t('useTemplate')}
                </Button>
                {#if !isPublishedCatalog(r)}
                  <div class="ml-auto">
                    <CardIconButton
                      tone="danger"
                      disabled={busyId === r.id || creating}
                      aria-label={t('deleteCard')}
                      title={t('deleteCard')}
                      onclick={() => requestDelete(r)}
                    >
                      <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
                    </CardIconButton>
                  </div>
                {/if}
              </div>
            {/snippet}
          </TemplatePreviewCard>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<ConfirmModal
  bind:open={confirmOpen}
  title={t('confirmDeleteTemplateTitle')}
  body={pendingDelete ? t('confirmDeleteTemplateBody', { title: pendingDelete.title }) : ''}
  confirmLabel={t('deleteCard')}
  onconfirm={deleteTemplate}
  oncancel={() => {
    pendingDelete = null;
  }}
/>
