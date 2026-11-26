<script lang="ts">
  import { onMount } from 'svelte';
  import { Pen, Save, Trash2 } from '@lucide/svelte';
  import { supabase } from '$lib/db/supabase';
  import { getLocalUser } from '$lib/db/local-session';
  import {
    useTemplateAndOpen,
    copyTemplateToAccount,
    copyTemplateAndEdit,
  } from '$lib/db/create-solve-node';
  import { softDeleteTemplate } from '$lib/db/soft-delete';
  import { publishTemplateDirect, unpublishTemplate } from '$lib/db/template-publish';
  import type { Model } from '$lib/domain';
  import { t } from '$lib/i18n';
  import {
    DEFAULT_NETWORK_TIMEOUT_MS,
    isLikelyNetworkFailure,
    isOnline,
    networkFailureMessage,
    withTimeout,
  } from '$lib/online';
  import { isAppOffline, refreshConnectivityProbe } from '$lib/connectivity.svelte';
  import { loadPublicTemplatesCache, savePublicTemplatesCache } from '$lib/db/offline-templates';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import CardIconButton from '$lib/components/ui/CardIconButton.svelte';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import TemplatePreviewCard from '$lib/components/TemplatePreviewCard.svelte';
  import InlineAlert from '$lib/components/ui/InlineAlert.svelte';
  import ListRefreshBar from '$lib/components/ui/ListRefreshBar.svelte';

  type Row = {
    id: string;
    title: string;
    model: Model | null;
    owner_id: string | null;
  };

  type PersonalPick = { id: string; title: string };

  let rows = $state<Row[]>([]);
  let personal = $state<PersonalPick[]>([]);
  let signedIn = $state(false);
  let canManage = $state(false);
  let busyId = $state<string | null>(null);
  let publishPick = $state('');
  let msg = $state('');
  let okMsg = $state('');
  let catalogFailed = $state(false);
  /** Showing IDB snapshot because live fetch failed / offline. */
  let showingCachedCatalog = $state(false);
  let catalogLoading = $state(true);
  let confirmOpen = $state(false);
  let pendingRemove = $state<Row | null>(null);

  const refreshMessage = $derived(
    catalogLoading
      ? ''
      : showingCachedCatalog || catalogFailed
        ? msg || (showingCachedCatalog ? t('templatesCachedBanner') : t('templatesOfflineBody'))
        : msg,
  );

  /** Paint cache immediately without failure banners (used before network refresh). */
  async function paintCatalogFromCache(): Promise<boolean> {
    const snap = await loadPublicTemplatesCache();
    if (!snap?.rows?.length) return false;
    rows = snap.rows;
    return true;
  }

  async function markCachedCatalog(emptyMsg = t('templatesCacheEmpty')) {
    const ok = await paintCatalogFromCache();
    showingCachedCatalog = ok;
    catalogFailed = true;
    msg = ok ? t('templatesCachedBanner') : emptyMsg;
    return ok;
  }

  async function reloadCatalog() {
    msg = '';
    okMsg = '';
    catalogFailed = false;
    showingCachedCatalog = false;
    await paintCatalogFromCache();
    catalogLoading = true;
    try {
      // Always re-probe when the OS reports online — Docker pause/resume does not
      // fire window online/offline, so a stale apiReachable=false would skip the network.
      if (isOnline()) {
        await refreshConnectivityProbe();
      }
      if (!isOnline() || isAppOffline()) {
        await markCachedCatalog();
        return;
      }
      const { data, error } = await withTimeout(
        supabase
          .from('templates')
          .select('id, title, model, owner_id')
          .eq('system_kind', 'public_repo')
          .eq('publish_status', 'approved')
          .is('deleted_at', null)
          .order('title'),
        DEFAULT_NETWORK_TIMEOUT_MS,
      );
      if (error) {
        catalogFailed = true;
        msg = networkFailureMessage(error, t('templatesOfflineBody'));
        if (isLikelyNetworkFailure(error)) {
          await markCachedCatalog();
        } else if (!rows.length) {
          rows = [];
          showingCachedCatalog = false;
        }
        return;
      }
      catalogFailed = false;
      msg = '';
      showingCachedCatalog = false;
      rows = (data ?? []) as Row[];
      await savePublicTemplatesCache(rows);
    } catch (e) {
      catalogFailed = true;
      msg = networkFailureMessage(e, t('templatesOfflineBody'));
      const ok = await markCachedCatalog();
      if (!ok) msg = t('templatesCacheEmpty');
    } finally {
      catalogLoading = false;
    }
  }

  async function reloadPersonal() {
    if (!canManage || isAppOffline()) {
      personal = [];
      return;
    }
    const user = await getLocalUser();
    if (!user) {
      personal = [];
      return;
    }
    try {
      const { data } = await withTimeout(
        supabase
          .from('templates')
          .select('id, title')
          .eq('owner_id', user.id)
          .is('deleted_at', null)
          .is('system_kind', null)
          .is('publish_status', null)
          .order('title'),
        DEFAULT_NETWORK_TIMEOUT_MS,
      );
      personal = (data ?? []) as PersonalPick[];
    } catch {
      personal = [];
    }
    if (publishPick && !personal.some((p) => p.id === publishPick)) {
      publishPick = personal[0]?.id ?? '';
    } else if (!publishPick && personal.length) {
      publishPick = personal[0].id;
    }
  }

  async function reloadAll() {
    msg = '';
    okMsg = '';
    await reloadCatalog();
    await reloadPersonal();
  }

  onMount(async () => {
    try {
      const user = await getLocalUser();
      signedIn = Boolean(user);
      const role = user?.app_metadata?.role;
      canManage = role === 'admin' || role === 'mod';
      await reloadAll();
    } catch (e) {
      catalogFailed = true;
      msg = networkFailureMessage(e, t('templatesOfflineBody'));
      await markCachedCatalog();
      catalogLoading = false;
    }
  });

  async function useTemplate(id: string) {
    if (busyId) return;
    busyId = id;
    msg = '';
    okMsg = '';
    const err = await useTemplateAndOpen(id);
    if (err) {
      msg = networkFailureMessage(err.error ?? err, t('templatesOfflineBody')) || t('useFailed');
    }
    busyId = null;
  }

  async function saveTemplate(id: string) {
    if (busyId) return;
    busyId = id;
    msg = '';
    okMsg = '';
    const result = await copyTemplateToAccount(id);
    if ('error' in result) {
      msg =
        networkFailureMessage(result.error, t('templatesOfflineBody')) || t('saveTemplateFailed');
    } else {
      okMsg = t('saveTemplateDone');
    }
    busyId = null;
  }

  async function editTemplate(id: string) {
    if (busyId) return;
    busyId = id;
    msg = '';
    okMsg = '';
    const err = await copyTemplateAndEdit(id);
    if (err) {
      msg =
        networkFailureMessage(err.error ?? err, t('templatesOfflineBody')) ||
        t('saveTemplateFailed');
    }
    busyId = null;
  }

  function requestRemoveFromCatalog(row: Row) {
    if (!canManage || busyId) return;
    pendingRemove = row;
    confirmOpen = true;
  }

  async function removeFromCatalog() {
    if (!canManage || !pendingRemove || busyId) return;
    const row = pendingRemove;
    busyId = row.id;
    msg = '';
    okMsg = '';
    if (row.owner_id == null) {
      const res = await softDeleteTemplate(row.id);
      if (res.error) msg = res.error;
      else {
        okMsg = t('catalogRemoveDone');
        await reloadCatalog();
      }
    } else {
      const res = await unpublishTemplate(row.id);
      if (res.error) msg = res.error;
      else {
        okMsg = t('catalogRemoveDone');
        await reloadCatalog();
        await reloadPersonal();
      }
    }
    busyId = null;
    pendingRemove = null;
  }

  async function publishMine() {
    if (!canManage || !publishPick || busyId) return;
    busyId = publishPick;
    msg = '';
    okMsg = '';
    const res = await publishTemplateDirect(publishPick);
    if (res.error) msg = res.error;
    else {
      okMsg = t('publishDirectDone');
      await reloadCatalog();
      await reloadPersonal();
    }
    busyId = null;
  }
</script>

<section class="mx-auto flex max-w-5xl flex-col gap-6">
  <PageHeader
    title={t('publicTemplates')}
    description={canManage ? t('publicTemplatesManageHint') : t('publicTemplatesHint')}
  />

  {#if okMsg}
    <p class="text-sm text-text-muted">{okMsg}</p>
  {/if}

  <ListRefreshBar
    refreshing={catalogLoading}
    message={refreshMessage}
    onretry={refreshMessage ? () => void reloadAll() : undefined}
  />

  {#if canManage}
    <div class="flex flex-wrap items-end gap-2 rounded-[12px] border border-border bg-bg-soft p-3">
      <label class="flex min-w-48 flex-1 flex-col gap-1.5">
        <span class="text-sm font-medium text-text">{t('publishDirectPick')}</span>
        {#if personal.length === 0}
          <span class="text-sm text-text-soft">{t('noPersonalToPublish')}</span>
        {:else}
          <select
            class="rounded-[8px] border border-border bg-bg px-3 py-2 text-sm text-text"
            bind:value={publishPick}
          >
            {#each personal as p (p.id)}
              <option value={p.id}>{p.title}</option>
            {/each}
          </select>
        {/if}
      </label>
      <Button
        variant="primary"
        disabled={!publishPick || busyId === publishPick || personal.length === 0 || catalogLoading}
        onclick={publishMine}
      >
        {t('publishDirect')}
      </Button>
    </div>
  {/if}

  {#if catalogFailed && rows.length === 0 && !catalogLoading}
    <EmptyState title={t('templatesOfflineTitle')} description={msg || t('templatesCacheEmpty')}>
      {#snippet action()}
        <Button variant="secondary" disabled={catalogLoading} onclick={() => void reloadAll()}>
          {t('retry')}
        </Button>
      {/snippet}
    </EmptyState>
  {:else if rows.length === 0 && !catalogLoading}
    <EmptyState title={t('catalogEmpty')} />
  {:else if rows.length > 0}
    <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each rows as r (r.id)}
        <li>
          <TemplatePreviewCard title={r.title} model={r.model}>
            {#snippet actions()}
              <Button
                variant="primary"
                class="px-3! py-1.5!"
                disabled={busyId === r.id}
                onclick={() => useTemplate(r.id)}
              >
                {busyId === r.id ? t('creatingTask') : t('useTemplate')}
              </Button>
              {#if signedIn}
                <div class="ml-auto flex gap-2">
                  <CardIconButton
                    disabled={busyId === r.id}
                    aria-label={t('saveTemplate')}
                    title={t('saveTemplate')}
                    onclick={() => saveTemplate(r.id)}
                  >
                    <Save size={18} strokeWidth={1.75} aria-hidden="true" />
                  </CardIconButton>
                  <CardIconButton
                    disabled={busyId === r.id}
                    aria-label={t('editTemplate')}
                    title={t('editTemplate')}
                    onclick={() => editTemplate(r.id)}
                  >
                    <Pen size={18} strokeWidth={1.75} aria-hidden="true" />
                  </CardIconButton>
                  {#if canManage}
                    <CardIconButton
                      tone="danger"
                      disabled={busyId === r.id}
                      aria-label={t('catalogRemove')}
                      title={t('catalogRemove')}
                      onclick={() => requestRemoveFromCatalog(r)}
                    >
                      <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
                    </CardIconButton>
                  {/if}
                </div>
              {/if}
            {/snippet}
          </TemplatePreviewCard>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<ConfirmModal
  bind:open={confirmOpen}
  title={t('confirmCatalogRemoveTitle')}
  body={pendingRemove ? t('confirmCatalogRemoveBody', { title: pendingRemove.title }) : ''}
  confirmLabel={t('catalogRemove')}
  onconfirm={removeFromCatalog}
  oncancel={() => {
    pendingRemove = null;
  }}
/>
