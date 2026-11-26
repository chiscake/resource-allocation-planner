<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/db/supabase';
  import { getLocalUser } from '$lib/db/local-session';
  import type { Model } from '$lib/domain';
  import { cloneModel } from '$lib/domain';
  import { useTemplateAndOpen } from '$lib/db/create-solve-node';
  import {
    getPersonalTemplateCacheRow,
    upsertPersonalTemplateCache,
  } from '$lib/db/offline-templates';
  import {
    requestTemplatePublish,
    withdrawTemplatePublish,
    unpublishTemplate,
    moderateTemplatePublish,
    canEditTemplateContent,
    isPublishedCatalog,
    isPublishPending,
    type PublishStatus,
  } from '$lib/db/template-publish';
  import { formatSavedAt } from '$lib/display/formatDateTime';
  import { isAppOffline, refreshConnectivityProbe } from '$lib/connectivity.svelte';
  import {
    DEFAULT_NETWORK_TIMEOUT_MS,
    isLikelyNetworkFailure,
    isOnline,
    networkFailureMessage,
    withTimeout,
  } from '$lib/online';
  import { t } from '$lib/i18n';
  import LpModelMatrix from '$lib/components/model/LpModelMatrix.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import InlineAlert from '$lib/components/ui/InlineAlert.svelte';

  type Mode = 'view' | 'edit';

  let title = $state('');
  let updatedAt = $state<string | null>(null);
  let model = $state<Model | null>(null);
  let systemKind = $state<string | null>(null);
  let publishStatus = $state<PublishStatus>(null);
  let isOwner = $state(false);
  let isStaff = $state(false);
  let dirty = $state(false);
  /** True until first successful cloud INSERT/UPDATE for this local id. */
  let cloudMissing = $state(false);
  let loading = $state(true);
  let saving = $state(false);
  let busy = $state(false);
  let using = $state(false);
  let mode = $state<Mode>('view');
  let msg = $state('');
  let err = $state('');
  let loadedId = $state('');
  let ownerId = $state<string | null>(null);

  const templateId = $derived(page.params.id ?? '');
  const contentEditable = $derived(
    canEditTemplateContent({
      system_kind: systemKind,
      publish_status: publishStatus,
    }),
  );
  const editing = $derived(mode === 'edit' && isOwner && contentEditable);
  const pendingForStaff = $derived(
    isStaff && !isOwner && isPublishPending({ publish_status: publishStatus }),
  );
  const headerDescription = $derived(
    pendingForStaff ? t('moderationReviewHint') : editing ? t('editTemplateTitle') : undefined,
  );
  const headerMeta = $derived(formatSavedAt(updatedAt) ?? undefined);
  /** Banner only after a failed save / explicit sync error — not on quiet localOnly open. */
  const showSyncBanner = $derived(Boolean(err));

  $effect(() => {
    const id = templateId;
    if (!id || id === loadedId) return;
    void loadTemplate(id);
  });

  function applyWantEdit(kind: string | null, status: PublishStatus) {
    const wantEdit =
      isOwner &&
      canEditTemplateContent({ system_kind: kind, publish_status: status }) &&
      page.url.searchParams.get('edit') === '1';
    mode = wantEdit ? 'edit' : 'view';
  }

  function applyCachedRow(
    cached: {
      title: string;
      updated_at: string | null;
      model: Model;
      system_kind: string | null;
      publish_status: PublishStatus;
      dirty?: boolean;
      localOnly?: boolean;
    },
    userId: string,
  ) {
    title = cached.title;
    updatedAt = cached.updated_at;
    model = cloneModel(cached.model);
    systemKind = cached.system_kind;
    publishStatus = cached.publish_status;
    dirty = Boolean(cached.dirty);
    cloudMissing = Boolean(cached.localOnly);
    isOwner = true;
    ownerId = userId;
    // Restore banner only if a previous save attempt left dirty.
    err = dirty ? t('templateSaveOffline') : '';
    applyWantEdit(cached.system_kind, cached.publish_status);
  }

  async function writeLocalCache(nextDirty: boolean) {
    const user = await getLocalUser();
    if (!user || !model) return;
    await upsertPersonalTemplateCache(user.id, {
      id: templateId,
      title,
      model,
      updated_at: updatedAt,
      system_kind: systemKind,
      publish_status: publishStatus,
      dirty: nextDirty,
      localOnly: cloudMissing,
    });
    dirty = nextDirty;
  }

  async function loadTemplate(id: string) {
    msg = '';
    const user = await getLocalUser();
    if (!user) {
      void goto('/login');
      return;
    }
    ownerId = user.id;
    const role = user.app_metadata?.role;
    isStaff = role === 'admin' || role === 'mod';

    // Fast path: paint IDB immediately; localOnly never waits on network.
    const cached = await getPersonalTemplateCacheRow(user.id, id);
    if (cached?.model) {
      applyCachedRow(
        {
          title: cached.title,
          updated_at: cached.updated_at,
          model: cached.model,
          system_kind: cached.system_kind,
          publish_status: cached.publish_status,
          dirty: cached.dirty,
          localOnly: cached.localOnly,
        },
        user.id,
      );
      loadedId = id;
      loading = false;
      if (cached.localOnly) return;
      if (!isOnline() || isAppOffline()) return;
    } else {
      loading = true;
      err = '';
      model = null;
      dirty = false;
      cloudMissing = false;
    }

    if (isOnline()) {
      await refreshConnectivityProbe();
    }

    if (!isOnline() || isAppOffline()) {
      if (!model) {
        err = t('notFound');
        loadedId = id;
        loading = false;
      }
      return;
    }

    try {
      const { data, error } = await withTimeout(
        supabase
          .from('templates')
          .select('id, title, model, owner_id, system_kind, publish_status, updated_at')
          .eq('id', id)
          .is('deleted_at', null)
          .maybeSingle(),
        DEFAULT_NETWORK_TIMEOUT_MS,
      );

      if (error && isLikelyNetworkFailure(error)) {
        if (!model) {
          err = networkFailureMessage(error, t('templateSaveOffline'));
          loadedId = id;
          loading = false;
        }
        return;
      }

      if (!data) {
        if (model && cloudMissing) {
          // Local draft not in cloud yet — stay quiet until save.
          loading = false;
          loadedId = id;
          return;
        }
        err = t('notFound');
        model = null;
        loadedId = id;
        loading = false;
        return;
      }

      isOwner = data.owner_id === user.id;
      const kind = (data.system_kind as string | null) ?? null;
      const status = (data.publish_status as PublishStatus) ?? null;
      const canStaffReview = isStaff && status === 'pending' && kind == null;

      if (!isOwner && !canStaffReview) {
        err = t('notFound');
        model = null;
        loadedId = id;
        loading = false;
        return;
      }
      if (isOwner && kind != null && kind !== 'public_repo') {
        err = t('notFound');
        model = null;
        loadedId = id;
        loading = false;
        return;
      }

      const latest = isOwner ? await getPersonalTemplateCacheRow(user.id, id) : null;
      if (latest?.dirty && latest.model) {
        applyCachedRow(
          {
            title: latest.title,
            updated_at: latest.updated_at,
            model: latest.model,
            system_kind: kind,
            publish_status: status,
            dirty: true,
            localOnly: latest.localOnly,
          },
          user.id,
        );
        cloudMissing = Boolean(latest.localOnly);
      } else {
        title = data.title as string;
        updatedAt = (data.updated_at as string | null) ?? null;
        model = cloneModel(data.model as Model);
        systemKind = kind;
        publishStatus = status;
        dirty = false;
        cloudMissing = false;
        err = '';
        if (isOwner) {
          await upsertPersonalTemplateCache(user.id, {
            id,
            title,
            model,
            updated_at: updatedAt,
            system_kind: kind,
            publish_status: status,
            dirty: false,
            localOnly: false,
          });
        }
        applyWantEdit(kind, status);
      }

      loadedId = id;
      loading = false;
    } catch (e) {
      if (!model) {
        err = networkFailureMessage(e, t('templateSaveOffline'));
        loadedId = id;
        loading = false;
      }
    }
  }

  function enterEdit() {
    if (!isOwner || !contentEditable) return;
    mode = 'edit';
    err = dirty ? t('templateSaveOffline') : '';
    msg = '';
    const url = new URL(page.url);
    url.searchParams.set('edit', '1');
    void goto(`${url.pathname}?${url.searchParams.toString()}`, {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  function enterView() {
    mode = 'view';
    err = dirty ? t('templateSaveOffline') : '';
    msg = '';
    const url = new URL(page.url);
    url.searchParams.delete('edit');
    const q = url.searchParams.toString();
    void goto(q ? `${url.pathname}?${q}` : url.pathname, {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  function onModelChange(next: Model) {
    if (!editing) return;
    model = next;
    msg = '';
  }

  /** Rename via PageHeader — same pattern as task page (title-only update). */
  async function renameTemplate(nextTitle: string) {
    if (!isOwner || !templateId || !model) return;
    const next = nextTitle.trim();
    if (!next || next === title) return;
    const stamp = new Date().toISOString();
    title = next;
    updatedAt = stamp;

    if (isAppOffline() || cloudMissing) {
      await writeLocalCache(true);
      err = t('templateSaveOffline');
      return;
    }

    try {
      const { error: upErr } = await withTimeout(
        supabase.from('templates').update({ title: next, updated_at: stamp }).eq('id', templateId),
        DEFAULT_NETWORK_TIMEOUT_MS,
      );
      if (upErr) {
        if (isLikelyNetworkFailure(upErr)) {
          await writeLocalCache(true);
          err = networkFailureMessage(upErr, t('templateSaveOffline'));
          return;
        }
        err = upErr.message || t('titleSaveFailed');
        return;
      }
      await writeLocalCache(false);
      err = '';
    } catch (e) {
      if (isLikelyNetworkFailure(e)) {
        await writeLocalCache(true);
        err = networkFailureMessage(e, t('templateSaveOffline'));
        return;
      }
      err = networkFailureMessage(e, t('titleSaveFailed'));
    }
  }

  async function persistToCloud(): Promise<boolean> {
    if (!model || !ownerId) return false;
    const stamp = updatedAt ?? new Date().toISOString();
    if (cloudMissing) {
      const { error: insErr } = await withTimeout(
        supabase.from('templates').insert({
          id: templateId,
          owner_id: ownerId,
          title,
          system_kind: null,
          model,
          what_if: model.what_if_defaults ?? null,
          updated_at: stamp,
        }),
        DEFAULT_NETWORK_TIMEOUT_MS,
      );
      if (insErr) {
        err = networkFailureMessage(insErr, t('templateSaveOffline'));
        await writeLocalCache(true);
        return false;
      }
      cloudMissing = false;
    } else {
      const { error: upErr } = await withTimeout(
        supabase
          .from('templates')
          .update({
            title,
            model,
            what_if: model.what_if_defaults ?? null,
            updated_at: stamp,
          })
          .eq('id', templateId),
        DEFAULT_NETWORK_TIMEOUT_MS,
      );
      if (upErr) {
        err = networkFailureMessage(upErr, t('templateSaveOffline'));
        await writeLocalCache(true);
        return false;
      }
    }
    await writeLocalCache(false);
    err = '';
    return true;
  }

  async function save() {
    if (!model || saving || !editing) return;
    saving = true;
    err = '';
    msg = '';
    const stamp = new Date().toISOString();
    updatedAt = stamp;

    if (isAppOffline() || (!isOnline() && cloudMissing)) {
      await writeLocalCache(true);
      err = t('templateSaveOffline');
      saving = false;
      return;
    }

    if (isOnline()) {
      await refreshConnectivityProbe();
    }
    if (isAppOffline()) {
      await writeLocalCache(true);
      err = t('templateSaveOffline');
      saving = false;
      return;
    }

    try {
      const ok = await persistToCloud();
      if (ok) msg = t('templateSaved');
    } catch (e) {
      await writeLocalCache(true);
      err = networkFailureMessage(e, t('templateSaveOffline'));
    }
    saving = false;
  }

  async function retrySync() {
    if (busy || saving || !model) return;
    if (isOnline()) await refreshConnectivityProbe();
    if (isAppOffline()) {
      err = t('templateSaveOffline');
      return;
    }
    busy = true;
    err = '';
    try {
      const ok = await persistToCloud();
      if (ok) msg = t('templateSaved');
    } catch (e) {
      await writeLocalCache(true);
      err = networkFailureMessage(e, t('templateSaveOffline'));
    }
    busy = false;
  }

  async function onRequest() {
    if (busy || !isOwner || dirty || isAppOffline()) return;
    busy = true;
    err = '';
    msg = '';
    const res = await requestTemplatePublish(templateId);
    if (res.error) err = res.error;
    else {
      msg = t('publishRequestDone');
      publishStatus = 'pending';
      systemKind = null;
      mode = 'view';
    }
    busy = false;
  }

  async function onWithdraw() {
    if (busy || !isOwner || dirty || isAppOffline()) return;
    busy = true;
    err = '';
    msg = '';
    const res = await withdrawTemplatePublish(templateId);
    if (res.error) err = res.error;
    else {
      msg = t('publishWithdrawDone');
      publishStatus = null;
    }
    busy = false;
  }

  async function onUnpublish() {
    if (busy || !isOwner || dirty || isAppOffline()) return;
    busy = true;
    err = '';
    msg = '';
    const res = await unpublishTemplate(templateId);
    if (res.error) err = res.error;
    else {
      msg = t('publishUnpublishDone');
      publishStatus = null;
      systemKind = null;
    }
    busy = false;
  }

  async function onModerate(action: 'approve' | 'reject') {
    if (busy || !pendingForStaff) return;
    busy = true;
    err = '';
    msg = '';
    const res = await moderateTemplatePublish(templateId, action);
    if (res.error) err = res.error;
    else {
      await goto('/app/moderation');
    }
    busy = false;
  }

  async function useTemplate() {
    if (using || !templateId) return;
    using = true;
    err = dirty ? t('templateSaveOffline') : '';
    msg = '';
    const res = await useTemplateAndOpen(templateId);
    if (res) err = res.error || t('useFailed');
    using = false;
  }
</script>

<section class="mx-auto flex max-w-4xl flex-col gap-6">
  {#if loading}
    <p class="text-sm text-text-muted">…</p>
  {:else if !model}
    <p class="text-danger-text">{err || t('notFound')}</p>
    <Button variant="secondary" href={isStaff ? '/app/moderation' : '/app/templates'}>
      {isStaff ? t('moderation') : t('templates')}
    </Button>
  {:else}
    <PageHeader
      {title}
      meta={headerMeta}
      description={headerDescription}
      editable={isOwner}
      ontitlecommit={renameTemplate}
    >
      {#snippet actions()}
        {#if dirty}
          <Badge variant="warning">{t('taskUnsyncedBadge')}</Badge>
        {:else if isPublishPending({ publish_status: publishStatus })}
          <Badge variant="warning">{t('publishStatusPending')}</Badge>
        {:else if isPublishedCatalog({ system_kind: systemKind, publish_status: publishStatus })}
          <Badge variant="success">{t('publishStatusPublic')}</Badge>
        {/if}
        {#if !editing}
          <Button variant="primary" disabled={using || busy} onclick={useTemplate}>
            {using ? t('creatingTask') : t('useTemplate')}
          </Button>
        {/if}
        {#if isOwner && contentEditable}
          {#if editing}
            <Button variant="secondary" onclick={enterView}>{t('backToView')}</Button>
          {:else}
            <Button variant="secondary" onclick={enterEdit}>{t('editTemplate')}</Button>
          {/if}
        {/if}
        {#if pendingForStaff}
          <Button variant="secondary" href="/app/moderation">{t('moderation')}</Button>
        {/if}
      {/snippet}
    </PageHeader>

    {#if showSyncBanner}
      <div class="flex flex-wrap items-center gap-3">
        <InlineAlert class="min-w-0 flex-1">{err || t('templateSaveOffline')}</InlineAlert>
        {#if dirty}
          <Button variant="secondary" disabled={busy || saving} onclick={() => void retrySync()}>
            {t('retry')}
          </Button>
        {/if}
      </div>
    {/if}
    {#if msg}
      <p class="text-sm text-text-muted">{msg}</p>
    {/if}

    <Card>
      <p class="mb-2 text-sm font-medium">{t('modelMatrix')}</p>
      <LpModelMatrix {model} onchange={onModelChange} readonly={!editing} />
      {#if editing}
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onclick={enterView}>{t('backToView')}</Button>
          <Button disabled={saving} onclick={save}>
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
      {/if}
    </Card>

    {#if isOwner && !editing && !dirty && !cloudMissing}
      <Card>
        <h2 class="mb-1 text-sm font-medium text-text">
          {t('publishSectionTitle')}
        </h2>
        {#if isPublishPending({ publish_status: publishStatus })}
          <p class="mb-4 text-sm text-text-muted">{t('publishPendingHint')}</p>
          <Button variant="secondary" disabled={busy || isAppOffline()} onclick={onWithdraw}>
            {t('publishWithdraw')}
          </Button>
        {:else if isPublishedCatalog({ system_kind: systemKind, publish_status: publishStatus })}
          <p class="mb-4 text-sm text-text-muted">{t('publishPublicHint')}</p>
          <Button variant="secondary" disabled={busy || isAppOffline()} onclick={onUnpublish}>
            {t('publishUnpublish')}
          </Button>
        {:else}
          <p class="mb-4 text-sm text-text-muted">{t('publishRequestHint')}</p>
          <Button variant="primary" disabled={busy || isAppOffline()} onclick={onRequest}>
            {t('publishRequest')}
          </Button>
        {/if}
      </Card>
    {/if}

    {#if pendingForStaff}
      <Card>
        <h2 class="mb-1 text-sm font-medium text-text">{t('moderation')}</h2>
        <p class="mb-4 text-sm text-text-muted">{t('moderationReviewHint')}</p>
        <div class="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onclick={() => onModerate('approve')}>
            {t('publishApprove')}
          </Button>
          <Button variant="secondary" disabled={busy} onclick={() => onModerate('reject')}>
            {t('publishReject')}
          </Button>
        </div>
      </Card>
    {/if}
  {/if}
</section>
