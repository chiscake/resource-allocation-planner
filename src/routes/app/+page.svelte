<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { supabase } from '$lib/db/supabase';
  import { softDeleteSolveNode, restoreSolveNode } from '$lib/db/soft-delete';
  import { isGuestWorthUploading, loadGuest } from '$lib/db/guest';
  import { uploadGuestIfAny } from '$lib/db/upload-guest';
  import type { Model } from '$lib/domain';
  import { t } from '$lib/i18n';
  import { optimisticDeleteWithUndo } from '$lib/ui/optimistic-delete';
  import Button from '$lib/components/ui/Button.svelte';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import GuestWorkspace from '$lib/components/GuestWorkspace.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import ScenarioCardGrid from '$lib/components/ScenarioCardGrid.svelte';
  import TaskPreviewCard from '$lib/components/TaskPreviewCard.svelte';
  import TemplatePreviewCard from '$lib/components/TemplatePreviewCard.svelte';
  import { createEmptySolveNodeAndOpen } from '$lib/db/create-solve-node';
  import { listCachedTasks } from '$lib/db/offline-tasks';
  import { getLocalUser } from '$lib/db/local-session';
  import { isAppOffline, refreshConnectivityProbe } from '$lib/connectivity.svelte';
  import {
    DEFAULT_NETWORK_TIMEOUT_MS,
    isLikelyNetworkFailure,
    isOnline,
    withTimeout,
  } from '$lib/online';
  import ListRefreshBar from '$lib/components/ui/ListRefreshBar.svelte';

  type Row = {
    id: string;
    title: string;
    updated_at: string;
    created_at?: string;
    is_favorite: boolean;
    org_id: string | null;
    org_visibility: string | null;
    model: Model | null;
    dirty?: boolean;
  };

  type TemplatePreview = {
    id: string;
    title: string;
    model: Model | null;
    updated_at: string;
    freshness: number;
    href: string;
    kind: 'personal' | 'public';
  };

  const HOME_CARD_LIMIT = 6;

  let signedIn = $state(false);
  let authReady = $state(false);
  let recent = $state<Row[]>([]);
  let recentTemplates = $state<TemplatePreview[]>([]);
  let pendingGuestUpload = $state(false);
  let guestUploadBusy = $state(false);
  let listsRefreshing = $state(false);
  let listsMsg = $state('');
  let recentFromCache = $state(false);
  let confirmOpen = $state(false);
  let pendingDelete = $state<Row | null>(null);

  const listSelect =
    'id, title, updated_at, created_at, is_favorite, org_id, org_visibility, model';

  function refreshPendingGuest() {
    const guest = loadGuest();
    pendingGuestUpload = !!guest && isGuestWorthUploading(guest);
  }

  function removeFromRecent(id: string) {
    recent = recent.filter((r) => r.id !== id);
  }

  function upsertRecent(row: Row) {
    recent = [row, ...recent.filter((r) => r.id !== row.id)].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }

  async function loadRecentTemplates(userId: string) {
    const { data: mine } = await supabase
      .from('templates')
      .select('id, title, model, updated_at')
      .eq('owner_id', userId)
      .is('deleted_at', null);

    const { data: uses } = await supabase
      .from('template_uses')
      .select('template_id, last_used_at')
      .eq('user_id', userId)
      .order('last_used_at', { ascending: false });

    const useMap = new Map(
      (uses ?? []).map((u) => [u.template_id as string, u.last_used_at as string]),
    );

    const publicIds = [...useMap.keys()];
    let publics: {
      id: string;
      title: string;
      model: Model | null;
      updated_at: string;
    }[] = [];
    if (publicIds.length) {
      const { data } = await supabase
        .from('templates')
        .select('id, title, model, updated_at')
        .in('id', publicIds)
        .eq('system_kind', 'public_repo')
        .eq('publish_status', 'approved')
        .is('deleted_at', null);
      publics = (data ?? []) as typeof publics;
    }

    const mixed: TemplatePreview[] = [];

    for (const trow of mine ?? []) {
      const usedAt = useMap.get(trow.id);
      const updated = new Date(trow.updated_at as string).getTime();
      const used = usedAt ? new Date(usedAt).getTime() : 0;
      mixed.push({
        id: trow.id,
        title: trow.title,
        model: trow.model as Model | null,
        updated_at: trow.updated_at as string,
        freshness: Math.max(updated, used),
        href: `/app/templates/${trow.id}`,
        kind: 'personal',
      });
    }

    for (const trow of publics) {
      const usedAt = useMap.get(trow.id);
      const updated = new Date(trow.updated_at).getTime();
      const used = usedAt ? new Date(usedAt).getTime() : 0;
      mixed.push({
        id: trow.id,
        title: trow.title,
        model: trow.model,
        updated_at: trow.updated_at,
        freshness: Math.max(updated, used),
        href: `/app/create?template=${encodeURIComponent(trow.id)}`,
        kind: 'public',
      });
    }

    recentTemplates = mixed.sort((a, b) => b.freshness - a.freshness).slice(0, HOME_CARD_LIMIT * 2);
  }

  async function loadRecentFromCache() {
    const cached = await listCachedTasks();
    if (!cached.length) return;
    recent = cached.map((c) => ({
      id: c.id,
      title: c.title,
      updated_at: c.updated_at,
      created_at: c.created_at,
      is_favorite: c.is_favorite,
      org_id: c.org_id,
      org_visibility: c.org_visibility,
      model: c.model,
      dirty: c.dirty,
    }));
    recentFromCache = true;
  }

  async function loadCloudLists() {
    listsMsg = '';
    await loadRecentFromCache();
    listsRefreshing = true;
    try {
      if (isOnline()) {
        await refreshConnectivityProbe();
      }
      if (isAppOffline()) {
        await loadRecentFromCache();
        recentTemplates = [];
        listsMsg = t('tasksOfflineCachedHint');
        return;
      }
      const user = await getLocalUser();
      if (!user) {
        recent = [];
        recentTemplates = [];
        recentFromCache = false;
        return;
      }
      const { data, error } = await withTimeout(
        supabase
          .from('solve_nodes')
          .select(listSelect)
          .eq('owner_id', user.id)
          .is('parent_id', null)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(40),
        DEFAULT_NETWORK_TIMEOUT_MS,
      );
      if (error && isLikelyNetworkFailure(error)) {
        await loadRecentFromCache();
        recentTemplates = [];
        listsMsg = t('tasksOfflineCachedHint');
        return;
      }
      if (error) {
        listsMsg = error.message;
        return;
      }
      const cloud = (data ?? []) as Row[];
      const dirtyMap = new Map((await listCachedTasks()).map((c) => [c.id, c.dirty]));
      recent = cloud.map((r) => ({ ...r, dirty: dirtyMap.get(r.id) ?? false }));
      recentFromCache = false;
      listsMsg = '';
      await loadRecentTemplates(user.id);
    } catch (e) {
      if (isLikelyNetworkFailure(e)) {
        await loadRecentFromCache();
        recentTemplates = [];
        listsMsg = t('tasksOfflineCachedHint');
      }
    } finally {
      listsRefreshing = false;
    }
  }

  async function retryGuestUpload() {
    if (guestUploadBusy) return;
    guestUploadBusy = true;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const uploaded = await uploadGuestIfAny(user.id);
      if (!uploaded.ok) {
        toast.error(uploaded.error);
        return;
      }
      if (uploaded.rootId) {
        toast.success(t('guestUploadOk'));
        pendingGuestUpload = false;
        await loadCloudLists();
        void goto(`/app/task/${uploaded.rootId}`);
      } else {
        pendingGuestUpload = false;
      }
    } finally {
      guestUploadBusy = false;
    }
  }

  function requestDelete(row: Row) {
    pendingDelete = row;
    confirmOpen = true;
  }

  async function deleteCard() {
    if (!pendingDelete) return;
    const row = pendingDelete;
    await optimisticDeleteWithUndo({
      item: row,
      removeOptimistic: () => removeFromRecent(row.id),
      restoreOptimistic: (snapshot) =>
        upsertRecent({
          ...snapshot,
          org_visibility: snapshot.org_id ? 'private' : null,
        }),
      softDelete: () => softDeleteSolveNode({ id: row.id, org_id: row.org_id }),
      restore: () => restoreSolveNode({ id: row.id, org_id: row.org_id }),
    });
    pendingDelete = null;
  }

  onMount(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      signedIn = !!data.session?.user;
      authReady = true;
      if (signedIn) {
        refreshPendingGuest();
        await loadCloudLists();
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      signedIn = !!session?.user;
      authReady = true;
      if (signedIn) {
        refreshPendingGuest();
        void loadCloudLists();
      } else {
        pendingGuestUpload = false;
        recent = [];
        recentTemplates = [];
      }
    });
    return () => subscription.unsubscribe();
  });
</script>

<section class="mx-auto flex max-w-5xl flex-col gap-8">
  {#if !authReady}
    <p class="text-sm text-text-muted">…</p>
  {:else if !signedIn}
    <PageHeader title={t('home')} description={t('homeGuestHint')} />

    <div class="mx-auto w-full max-w-4xl">
      <GuestWorkspace compact />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Button variant="secondary" href="/app/public-templates">{t('publicTemplates')}</Button>
    </div>

    <aside class="rounded-[12px] border border-border bg-bg-soft px-6 py-8 text-center sm:px-10">
      <p class="text-lg font-medium tracking-tight text-text">{t('homeLoginUpsellTitle')}</p>
      <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
        {t('homeLoginUpsellBody')}
      </p>
      <div class="mt-5 flex justify-center">
        <Button href="/login">{t('homeLoginUpsellCta')}</Button>
      </div>
    </aside>
  {:else}
    <PageHeader title={t('home')} description={t('homeHint')} />

    {#if pendingGuestUpload}
      <div
        class="flex flex-col gap-3 rounded-[8px] bg-warning-bg px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <p class="text-sm text-warning-text">{t('guestUploadPending')}</p>
        <Button
          variant="secondary"
          class="shrink-0"
          disabled={guestUploadBusy}
          onclick={() => void retryGuestUpload()}
        >
          {t('guestUploadRetry')}
        </Button>
      </div>
    {/if}

    <div>
      <Button
        class="px-6! py-3! text-base"
        onclick={() => {
          void createEmptySolveNodeAndOpen();
        }}
      >
        + {t('newTask')}
      </Button>
    </div>

    <ListRefreshBar
      refreshing={listsRefreshing}
      message={listsMsg}
      onretry={listsMsg ? () => void loadCloudLists() : undefined}
    />

    <ScenarioCardGrid title={t('recent')} items={recent} limit={HOME_CARD_LIMIT} disableExpand>
      {#snippet headerActions()}
        <Button variant="ghost" href="/app/tasks">{t('showAll')}</Button>
      {/snippet}
      {#snippet empty()}
        {#if listsRefreshing}
          <p class="text-sm text-text-muted">{t('listRefreshing')}</p>
        {:else}
          <EmptyState title={t('noScenarios')} description={t('noScenariosHint')}>
            {#snippet action()}
              <Button href="/app/create">{t('newTask')}</Button>
            {/snippet}
          </EmptyState>
        {/if}
      {/snippet}
      {#snippet children(r)}
        <TaskPreviewCard
          href="/app/task/{r.id}"
          title={r.title}
          updatedAt={r.updated_at}
          createdAt={r.created_at}
          model={r.model}
          favorite={r.is_favorite}
          unsynced={Boolean(r.dirty)}
          onDelete={recentFromCache || isAppOffline() ? undefined : () => requestDelete(r)}
        />
      {/snippet}
    </ScenarioCardGrid>

    <ScenarioCardGrid
      title={t('recentTemplates')}
      items={recentTemplates}
      limit={HOME_CARD_LIMIT}
      disableExpand
    >
      {#snippet headerActions()}
        <Button variant="ghost" href="/app/templates">{t('myTemplates')}</Button>
        <Button variant="ghost" href="/app/public-templates">{t('publicTemplates')}</Button>
      {/snippet}
      {#snippet empty()}
        <p class="text-sm text-text-muted">{t('recentTemplatesEmpty')}</p>
      {/snippet}
      {#snippet children(tpl)}
        <TemplatePreviewCard
          href={tpl.href}
          title={tpl.title}
          model={tpl.model}
          updatedAt={tpl.updated_at}
          subtitle={tpl.kind === 'public' ? t('publicTemplates') : t('templates')}
        />
      {/snippet}
    </ScenarioCardGrid>
  {/if}
</section>

<ConfirmModal
  bind:open={confirmOpen}
  title={t('confirmTrashTitle')}
  body={pendingDelete ? t('confirmTrashBody', { title: pendingDelete.title }) : ''}
  confirmLabel={t('trashToBin')}
  onconfirm={deleteCard}
  oncancel={() => {
    pendingDelete = null;
  }}
/>
