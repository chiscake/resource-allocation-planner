<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Trash2 } from '@lucide/svelte';
  import { supabase } from '$lib/db/supabase';
  import { getLocalUser } from '$lib/db/local-session';
  import { createBlankPersonalTemplate, useTemplateAndOpen } from '$lib/db/create-solve-node';
  import { softDeleteTemplate, restoreTemplate } from '$lib/db/soft-delete';
  import {
    isPublishedCatalog,
    isPublishPending,
    type PublishStatus,
  } from '$lib/db/template-publish';
  import {
    loadPersonalTemplatesCache,
    savePersonalTemplatesCache,
    savePersonalTemplatesCacheMergingDirty,
    type CachedPersonalTemplate,
  } from '$lib/db/offline-templates';
  import type { Model } from '$lib/domain';
  import { t } from '$lib/i18n';
  import { isAppOffline, refreshConnectivityProbe } from '$lib/connectivity.svelte';
  import {
    DEFAULT_NETWORK_TIMEOUT_MS,
    isLikelyNetworkFailure,
    isOnline,
    networkFailureMessage,
    withTimeout,
  } from '$lib/online';
  import { optimisticDeleteWithUndo } from '$lib/ui/optimistic-delete';
  import TemplatePreviewCard from '$lib/components/TemplatePreviewCard.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import CardIconButton from '$lib/components/ui/CardIconButton.svelte';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import ListRefreshBar from '$lib/components/ui/ListRefreshBar.svelte';

  type Row = {
    id: string;
    title: string;
    model: Model | null;
    updated_at: string | null;
    system_kind: string | null;
    publish_status: PublishStatus;
    dirty?: boolean;
    localOnly?: boolean;
  };

  let rows = $state<Row[]>([]);
  let busyId = $state<string | null>(null);
  let creating = $state(false);
  let msg = $state('');
  let okMsg = $state('');
  let refreshing = $state(false);
  let fromCache = $state(false);
  let confirmOpen = $state(false);
  let pendingDelete = $state<Row | null>(null);
  let userId = $state<string | null>(null);

  const refreshMessage = $derived(refreshing ? '' : msg);

  function sortByTitle(list: Row[]) {
    return [...list].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }

  function toCacheRows(list: Row[]): CachedPersonalTemplate[] {
    return list.map((r) => ({
      id: r.id,
      title: r.title,
      model: r.model,
      updated_at: r.updated_at,
      system_kind: r.system_kind,
      publish_status: r.publish_status,
      dirty: r.dirty,
      localOnly: r.localOnly,
    }));
  }

  function rowsFromCache(list: CachedPersonalTemplate[]): Row[] {
    return sortByTitle(
      list.map((r) => ({
        id: r.id,
        title: r.title,
        model: r.model,
        updated_at: r.updated_at,
        system_kind: r.system_kind,
        publish_status: r.publish_status,
        dirty: Boolean(r.dirty),
        localOnly: Boolean(r.localOnly),
      })),
    );
  }

  async function paintFromCache(uid: string): Promise<boolean> {
    const snap = await loadPersonalTemplatesCache(uid);
    if (!snap?.rows?.length) return false;
    rows = rowsFromCache(snap.rows);
    return true;
  }

  async function reload() {
    msg = '';
    okMsg = '';
    fromCache = false;
    const user = await getLocalUser();
    userId = user?.id ?? null;
    if (!user) {
      rows = [];
      msg = t('noSession');
      return;
    }
    await paintFromCache(user.id);
    refreshing = true;
    try {
      if (isOnline()) {
        await refreshConnectivityProbe();
      }
      if (isAppOffline()) {
        const ok = await paintFromCache(user.id);
        fromCache = ok;
        msg = ok ? t('personalTemplatesCachedBanner') : t('personalTemplatesCacheEmpty');
        return;
      }
      const { data, error } = await withTimeout(
        supabase
          .from('templates')
          .select('id, title, model, updated_at, system_kind, publish_status')
          .is('deleted_at', null)
          .eq('owner_id', user.id)
          .or('system_kind.is.null,system_kind.eq.public_repo')
          .order('title'),
        DEFAULT_NETWORK_TIMEOUT_MS,
      );
      if (error) {
        if (isLikelyNetworkFailure(error)) {
          const ok = (await paintFromCache(user.id)) || rows.length > 0;
          fromCache = ok;
          msg = ok ? t('personalTemplatesCachedBanner') : t('personalTemplatesCacheEmpty');
        } else {
          msg = error.message;
        }
        return;
      }
      const cloud = (data ?? []) as Row[];
      const snap = await savePersonalTemplatesCacheMergingDirty(
        user.id,
        cloud.map((r) => ({ ...r, dirty: false })),
      );
      rows = rowsFromCache(snap.rows);
      fromCache = false;
      msg = '';
    } catch (e) {
      if (isLikelyNetworkFailure(e)) {
        const ok = (await paintFromCache(user.id)) || rows.length > 0;
        fromCache = ok;
        msg = ok
          ? t('personalTemplatesCachedBanner')
          : networkFailureMessage(e, t('personalTemplatesCacheEmpty'));
      } else {
        msg = networkFailureMessage(e, t('personalTemplatesCacheEmpty'));
      }
    } finally {
      refreshing = false;
    }
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
    if (busyId || creating || fromCache) return;
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
    if (userId) {
      await savePersonalTemplatesCache(userId, toCacheRows(rows));
    }
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

  {#if okMsg}
    <p class="text-sm text-text-muted">{okMsg}</p>
  {/if}

  <ListRefreshBar
    {refreshing}
    message={refreshMessage}
    onretry={refreshMessage ? () => void reload() : undefined}
  />

  {#if rows.length === 0 && !refreshing}
    <EmptyState
      title={msg && fromCache ? t('templatesOfflineTitle') : t('noPersonalTemplates')}
      description={msg && fromCache ? msg : undefined}
    >
      {#snippet action()}
        <Button variant="primary" disabled={creating || !!busyId} onclick={() => createTemplate()}>
          {creating ? t('creatingTemplate') : t('createTemplate')}
        </Button>
      {/snippet}
    </EmptyState>
  {:else if rows.length > 0}
    <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each rows as r (r.id)}
        <li>
          <TemplatePreviewCard
            title={r.title}
            model={r.model}
            href="/app/templates/{r.id}{r.dirty || r.localOnly ? '?edit=1' : ''}"
            updatedAt={r.updated_at}
            unsynced={Boolean(r.dirty)}
          >
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
                {#if !isPublishedCatalog(r) && !fromCache && !r.dirty && !r.localOnly}
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
