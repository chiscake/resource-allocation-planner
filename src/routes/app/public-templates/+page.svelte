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

  async function reloadCatalog() {
    const { data, error } = await supabase
      .from('templates')
      .select('id, title, model, owner_id')
      .eq('system_kind', 'public_repo')
      .eq('publish_status', 'approved')
      .is('deleted_at', null)
      .order('title');
    if (error) {
      msg = error.message;
      rows = [];
      return;
    }
    rows = (data ?? []) as Row[];
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

  onMount(async () => {
    const { data: auth } = await supabase.auth.getUser();
    signedIn = Boolean(auth.user);
    const role = auth.user?.app_metadata?.role;
    canManage = role === 'admin' || role === 'mod';
    await reloadCatalog();
    await reloadPersonal();
  });

  async function useTemplate(id: string) {
    if (busyId) return;
    busyId = id;
    msg = '';
    okMsg = '';
    const err = await useTemplateAndOpen(id);
    if (err) msg = err.error || t('useFailed');
    busyId = null;
  }

  async function saveTemplate(id: string) {
    if (busyId) return;
    busyId = id;
    msg = '';
    okMsg = '';
    const result = await copyTemplateToAccount(id);
    if ('error' in result) {
      msg = result.error || t('saveTemplateFailed');
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
    if (err) msg = err.error || t('saveTemplateFailed');
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

  {#if msg}
    <InlineAlert>{msg}</InlineAlert>
  {/if}
  {#if okMsg}
    <p class="text-sm text-text-muted">{okMsg}</p>
  {/if}

  {#if canManage}
    <div class="flex flex-wrap items-end gap-2 rounded-[12px] border border-border bg-bg-soft p-3">
      <label class="flex min-w-[12rem] flex-1 flex-col gap-1.5">
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

  {#if rows.length === 0}
    <EmptyState title={t('catalogEmpty')} />
  {:else}
    <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each rows as r (r.id)}
        <li>
          <TemplatePreviewCard title={r.title} model={r.model}>
            {#snippet actions()}
              <Button
                variant="primary"
                class="!px-3 !py-1.5"
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
