<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/db/supabase';
  import { softDeleteSolveNode, restoreSolveNode } from '$lib/db/soft-delete';
  import { listCachedTasks } from '$lib/db/offline-tasks';
  import { getLocalUser } from '$lib/db/local-session';
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
  import Button from '$lib/components/ui/Button.svelte';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import ListRefreshBar from '$lib/components/ui/ListRefreshBar.svelte';
  import ScenarioCardGrid from '$lib/components/ScenarioCardGrid.svelte';
  import TaskPreviewCard from '$lib/components/TaskPreviewCard.svelte';

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

  let rows = $state<Row[]>([]);
  let query = $state('');
  let msg = $state('');
  let refreshing = $state(false);
  let fromCache = $state(false);
  let confirmOpen = $state(false);
  let pendingDelete = $state<Row | null>(null);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows;
    return [...list].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  });

  function sortByUpdated(list: Row[]) {
    return [...list].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }

  function rowsFromCache(cached: Awaited<ReturnType<typeof listCachedTasks>>): Row[] {
    return cached.map((c) => ({
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
  }

  async function showCache() {
    const cached = await listCachedTasks();
    if (cached.length) {
      rows = rowsFromCache(cached);
      fromCache = true;
    }
  }

  async function load() {
    msg = '';
    await showCache();
    refreshing = true;
    try {
      if (isOnline()) {
        await refreshConnectivityProbe();
      }
      if (isAppOffline()) {
        if (!rows.length) await showCache();
        fromCache = true;
        msg = t('tasksOfflineCachedHint');
        return;
      }
      const user = await getLocalUser();
      if (!user) {
        rows = [];
        msg = t('noSession');
        fromCache = false;
        return;
      }
      const { data, error } = await withTimeout(
        supabase
          .from('solve_nodes')
          .select('id, title, updated_at, created_at, is_favorite, org_id, org_visibility, model')
          .eq('owner_id', user.id)
          .is('parent_id', null)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false }),
        DEFAULT_NETWORK_TIMEOUT_MS,
      );
      if (error) {
        if (isLikelyNetworkFailure(error)) {
          if (!rows.length) await showCache();
          fromCache = true;
          msg = t('tasksOfflineCachedHint');
        } else {
          msg = error.message;
          if (!rows.length) rows = [];
        }
        return;
      }
      const cloud = (data ?? []) as Row[];
      const dirtyMap = new Map((await listCachedTasks()).map((c) => [c.id, c.dirty]));
      rows = cloud.map((r) => ({ ...r, dirty: dirtyMap.get(r.id) ?? false }));
      fromCache = false;
      msg = '';
    } catch (e) {
      if (isLikelyNetworkFailure(e)) {
        if (!rows.length) await showCache();
        fromCache = true;
        msg = t('tasksOfflineCachedHint');
      } else {
        msg = networkFailureMessage(e, t('taskLoadOffline'));
      }
    } finally {
      refreshing = false;
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
      removeOptimistic: () => {
        rows = rows.filter((r) => r.id !== row.id);
      },
      restoreOptimistic: (snapshot) => {
        const restoredRow: Row = {
          ...snapshot,
          org_visibility: snapshot.org_id ? 'private' : null,
        };
        rows = sortByUpdated([restoredRow, ...rows.filter((r) => r.id !== restoredRow.id)]);
      },
      softDelete: () => softDeleteSolveNode({ id: row.id, org_id: row.org_id }),
      restore: () => restoreSolveNode({ id: row.id, org_id: row.org_id }),
    });
    pendingDelete = null;
  }

  onMount(() => {
    void load();
  });
</script>

<section class="mx-auto flex max-w-5xl flex-col gap-6">
  <PageHeader title={t('myTasks')} description={t('myTasksHint')}>
    {#snippet actions()}
      <Button variant="primary" href="/app/create">{t('createTask')}</Button>
    {/snippet}
  </PageHeader>

  <label class="block max-w-md">
    <span class="mb-1 block text-sm text-text-muted">{t('searchByName')}</span>
    <Input type="search" bind:value={query} placeholder={t('searchByNamePlaceholder')} />
  </label>

  <ListRefreshBar {refreshing} message={msg} onretry={msg ? () => void load() : undefined} />

  <ScenarioCardGrid items={filtered}>
    {#snippet empty()}
      {#if refreshing}
        <p class="text-sm text-text-muted">{t('listRefreshing')}</p>
      {:else}
        <EmptyState title={t('noScenarios')} description={t('noScenariosHint')}>
          {#snippet action()}
            <Button variant="primary" href="/app/create">{t('createTask')}</Button>
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
        onDelete={fromCache ? undefined : () => requestDelete(r)}
      />
    {/snippet}
  </ScenarioCardGrid>
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
