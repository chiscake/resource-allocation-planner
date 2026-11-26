<script lang="ts">
  import { onMount } from 'svelte';
  import { Pen, Save, Trash2 } from '@lucide/svelte';
  import { supabase } from '$lib/db/supabase';
  import {
    useTemplateAndOpen,
    copyTemplateToAccount,
    copyTemplateAndEdit,
  } from '$lib/db/create-solve-node';
  import { softDeleteTemplate } from '$lib/db/soft-delete';
  import { publishTemplateDirect, unpublishTemplate } from '$lib/db/template-publish';
  import type { Model } from '$lib/domain';
  import { t } from '$lib/i18n';
  import { isLikelyNetworkFailure, isOnline, networkFailureMessage } from '$lib/online';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import CardIconButton from '$lib/components/ui/CardIconButton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import TemplatePreviewCard from '$lib/components/TemplatePreviewCard.svelte';
  import InlineAlert from '$lib/components/ui/InlineAlert.svelte';

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
  let catalogLoading = $state(true);

  async function reloadCatalog() {
    catalogLoading = true;
    if (!isOnline()) {
      catalogFailed = true;
      msg = t('templatesOfflineBody');
      catalogLoading = false;
      return;
    }
    const { data, error } = await supabase
      .from('templates')
      .select('id, title, model, owner_id')
      .eq('system_kind', 'public_repo')
      .eq('publish_status', 'approved')
      .is('deleted_at', null)
      .order('title');
    if (error) {
      catalogFailed = true;
      msg = networkFailureMessage(error, t('templatesOfflineBody'));
      if (isLikelyNetworkFailure(error)) {
        // Keep any previously loaded rows; do not pretend the catalog is empty.
      } else {
        rows = [];
      }
      catalogLoading = false;
      return;
    }
    catalogFailed = false;
    msg = '';
    rows = (data ?? []) as Row[];
    catalogLoading = false;
  }

  async function reloadPersonal() {
    if (!canManage) {
      personal = [];
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      personal = [];
      return;
    }
    const { data } = await supabase
      .from('templates')
      .select('id, title')
      .eq('owner_id', auth.user.id)
      .is('deleted_at', null)
      .is('system_kind', null)
      .is('publish_status', null)
      .order('title');
    personal = (data ?? []) as PersonalPick[];
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
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr && isLikelyNetworkFailure(authErr)) {
        catalogFailed = true;
        msg = t('templatesOfflineBody');
        catalogLoading = false;
        return;
      }
      signedIn = Boolean(auth.user);
      const role = auth.user?.app_metadata?.role;
      canManage = role === 'admin' || role === 'mod';
      await reloadAll();
    } catch (e) {
      catalogFailed = true;
      msg = networkFailureMessage(e, t('templatesOfflineBody'));
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

  async function removeFromCatalog(row: Row) {
    if (!canManage || busyId) return;
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

  {#if msg && !catalogFailed}
    <InlineAlert>{msg}</InlineAlert>
  {/if}
  {#if okMsg}
    <p class="text-sm text-text-muted">{okMsg}</p>
  {/if}

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
        disabled={!publishPick || busyId === publishPick || personal.length === 0}
        onclick={publishMine}
      >
        {t('publishDirect')}
      </Button>
    </div>
  {/if}

  {#if catalogFailed && rows.length === 0}
    <EmptyState title={t('templatesOfflineTitle')} description={msg || t('templatesOfflineBody')}>
      {#snippet action()}
        <Button variant="secondary" disabled={catalogLoading} onclick={() => void reloadAll()}>
          {t('retry')}
        </Button>
      {/snippet}
    </EmptyState>
  {:else if catalogLoading && rows.length === 0}
    <p class="text-sm text-text-muted">…</p>
  {:else if rows.length === 0}
    <EmptyState title={t('catalogEmpty')} />
  {:else}
    {#if catalogFailed}
      <div class="flex flex-wrap items-center gap-3">
        <InlineAlert class="min-w-0 flex-1">{msg || t('templatesOfflineBody')}</InlineAlert>
        <Button variant="secondary" disabled={catalogLoading} onclick={() => void reloadAll()}>
          {t('retry')}
        </Button>
      </div>
    {/if}
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
                      onclick={() => removeFromCatalog(r)}
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
