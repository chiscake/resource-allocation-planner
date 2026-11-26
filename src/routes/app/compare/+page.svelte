<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { supabase } from '$lib/db/supabase';
  import { t } from '$lib/i18n';
  import type { Model, SolveResult } from '$lib/domain';
  import { formatCompareIds, nodeIdsEqual, parseCompareIds } from '$lib/domain';
  import { getRoundPlanPreference } from '$lib/display';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import RoundPlanToggle from '$lib/components/model/RoundPlanToggle.svelte';
  import CompareTaskCard from '$lib/components/model/CompareTaskCard.svelte';
  import ComparePickerModal from '$lib/components/model/ComparePickerModal.svelte';

  type NodeView = {
    id: string;
    title: string;
    result: SolveResult | null;
    model: Model | null;
  };

  type SavedRow = { id: string; node_ids: string[]; created_at: string };

  let selectedIds = $state<string[]>([]);
  let views = $state<NodeView[]>([]);
  let saved = $state<SavedRow[]>([]);
  let roundPlan = $state(false);
  let pickerOpen = $state(false);
  let loading = $state(false);
  /** Avoid re-opening picker if user dismissed it for the same single-id entry. */
  let autoPickerFor = $state('');
  let confirmOpen = $state(false);
  let pendingHardDeleteId = $state<string | null>(null);

  const primary = $derived(views[0] ?? null);

  async function loadSaved() {
    const { data } = await supabase
      .from('comparisons')
      .select('id, node_ids, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    saved = (data ?? []) as SavedRow[];
  }

  function tasksCountLabel(n: number): string {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    const key =
      abs > 10 && abs < 20
        ? 'compareSavedTasksMany'
        : last === 1
          ? 'compareSavedTasksOne'
          : last >= 2 && last <= 4
            ? 'compareSavedTasksFew'
            : 'compareSavedTasksMany';
    return t(key, { n: String(n) });
  }

  function formatAbsoluteDate(iso: string): string {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}.${mm}.${yyyy}`;
  }

  function formatRelativeAgo(iso: string): string {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) return '—';
    const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (sec < 60) return t('compareRelJustNow');
    const min = Math.floor(sec / 60);
    if (min < 60) return t('compareRelMinutes', { n: String(min) });
    const hours = Math.floor(min / 60);
    if (hours < 48) return t('compareRelHours', { n: String(hours) });
    const days = Math.floor(hours / 24);
    return t('compareRelDays', { n: String(days) });
  }

  function savedLabel(row: SavedRow): string {
    const count = row.node_ids?.length ?? 0;
    return `${tasksCountLabel(count)} · ${formatRelativeAgo(row.created_at)} · ${formatAbsoluteDate(row.created_at)}`;
  }

  async function syncUrl(ids: string[]) {
    const q = formatCompareIds(ids);
    const url = q ? `/app/compare?ids=${encodeURIComponent(q)}` : '/app/compare';
    await goto(url, { replaceState: true, noScroll: true, keepFocus: true });
  }

  async function loadViews(ids: string[]) {
    selectedIds = ids;
    if (!ids.length) {
      views = [];
      return;
    }
    loading = true;
    try {
      const { data } = await supabase
        .from('solve_nodes')
        .select('id, title, result, model')
        .in('id', ids);
      const rows = (data ?? []) as NodeView[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      views = ids.map((id) => byId.get(id)).filter((v): v is NodeView => Boolean(v));
    } finally {
      loading = false;
    }
  }

  /** Dedupe by ordered node_ids; bump created_at or insert when ≥2. */
  async function persistComparison(ids: string[]) {
    if (ids.length < 2) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from('comparisons')
      .select('id, node_ids')
      .eq('owner_id', user.id)
      .limit(100);

    const match = (existing ?? []).find((row) =>
      nodeIdsEqual((row.node_ids as string[]) ?? [], ids),
    );

    if (match) {
      await supabase
        .from('comparisons')
        .update({ created_at: new Date().toISOString() })
        .eq('id', match.id);
    } else {
      await supabase.from('comparisons').insert({
        owner_id: user.id,
        node_ids: ids,
      });
    }
    await loadSaved();
  }

  async function applyIds(ids: string[]) {
    // Load first so selectedIds matches before URL replace — effect won't re-enter.
    await loadViews(ids);
    await syncUrl(ids);
    await persistComparison(ids);
  }

  /** Deep-link / task FAB·row: load views, persist if ≥2, open picker if single primary. */
  async function applyFromUrl(ids: string[]) {
    await loadViews(ids);
    if (ids.length >= 2) {
      await persistComparison(ids);
      return;
    }
    if (ids.length === 1) {
      const key = formatCompareIds(ids);
      if (autoPickerFor !== key) {
        autoPickerFor = key;
        pickerOpen = true;
      }
    }
  }

  onMount(async () => {
    roundPlan = getRoundPlanPreference();
    await loadSaved();
  });

  $effect(() => {
    const fromUrl = parseCompareIds(page.url.searchParams.get('ids'));
    const current = formatCompareIds(selectedIds);
    const next = formatCompareIds(fromUrl);
    if (next !== current) {
      void applyFromUrl(fromUrl);
    }
  });

  function requestHardDelete(id: string) {
    pendingHardDeleteId = id;
    confirmOpen = true;
  }

  async function hardDelete() {
    if (!pendingHardDeleteId) return;
    const id = pendingHardDeleteId;
    await supabase.from('comparisons').delete().eq('id', id);
    pendingHardDeleteId = null;
    await loadSaved();
  }

  async function reopen(ids: string[]) {
    await applyIds(ids.slice(0, 4));
  }

  async function removeCard(id: string) {
    await applyIds(selectedIds.filter((x) => x !== id));
  }
</script>

<section class="space-y-6">
  <div class="mx-auto max-w-5xl space-y-6">
    <PageHeader title={t('compare')} description={t('compareHint')}>
      {#snippet actions()}
        <Button onclick={() => (pickerOpen = true)}>{t('comparePickTasks')}</Button>
      {/snippet}
    </PageHeader>

    <ComparePickerModal
      bind:open={pickerOpen}
      initialIds={selectedIds}
      onconfirm={(ids) => void applyIds(ids)}
    />

    {#if loading}
      <p class="text-sm text-text-muted">{t('compareLoading')}</p>
    {:else if views.length}
      <RoundPlanToggle bind:roundPlan />
    {:else}
      <EmptyState title={t('compareEmpty')} description={t('compareEmptyHint')} />
    {/if}
  </div>

  {#if !loading && views.length}
    <!-- Full main width (cancel page padding); cards keep ~½ of max-w-5xl. -->
    <div class="-mx-6 overflow-x-auto px-6 pb-2">
      <div class="flex w-max gap-4">
        {#each views as side, i (side.id)}
          <div class="w-126 max-w-[calc(100vw-3rem)] shrink-0">
            <CompareTaskCard
              title={side.title}
              model={side.model}
              result={side.result}
              {roundPlan}
              isPrimary={i === 0}
              primaryModel={primary?.model ?? null}
              primaryResult={primary?.result ?? null}
              onRemove={() => void removeCard(side.id)}
            />
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="mx-auto max-w-5xl">
    <h2 class="mb-3 text-lg font-medium">{t('compareSaved')}</h2>
    {#if saved.length === 0}
      <EmptyState title={t('compareEmpty')} description={t('compareEmptyHint')} />
    {:else}
      <ul class="space-y-2">
        {#each saved as s (s.id)}
          <Card padding={false} class="flex items-center justify-between gap-3 px-4 py-3">
            <button
              type="button"
              class="text-left text-sm text-brand hover:underline"
              onclick={() => void reopen(s.node_ids)}
            >
              {savedLabel(s)}
            </button>
            <Button
              variant="ghost"
              class="text-danger-text!"
              onclick={() => requestHardDelete(s.id)}
            >
              {t('hardDelete')}
            </Button>
          </Card>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<ConfirmModal
  bind:open={confirmOpen}
  title={t('confirmDeleteCompareTitle')}
  body={t('confirmDeleteCompareBody')}
  confirmLabel={t('hardDelete')}
  onconfirm={hardDelete}
  oncancel={() => {
    pendingHardDeleteId = null;
  }}
/>
