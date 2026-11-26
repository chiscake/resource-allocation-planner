<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/db/supabase';
  import { loadLineageGraphForUser } from '$lib/db/load-lineage-graph';
  import type { LineageGraph, LineageGraphNode } from '$lib/domain';
  import { t } from '$lib/i18n';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import LineageGraphCanvas from '$lib/components/graph/LineageGraphCanvas.svelte';

  let graph = $state<LineageGraph | null>(null);
  let loading = $state(true);
  let error = $state('');
  let selectedId = $state<string | null>(null);

  const selected = $derived(
    selectedId && graph ? (graph.nodes.find((n) => n.id === selectedId) ?? null) : null,
  );

  const canvasNodes = $derived(
    (graph?.nodes ?? []).map((n) => ({
      id: n.id,
      name: n.name,
      role: n.role,
      gray: n.gray,
    })),
  );

  const canvasEdges = $derived(
    (graph?.edges ?? []).map((e) => ({
      id: e.id,
      fromId: e.fromId,
      toId: e.toId,
      kind: e.kind,
    })),
  );

  async function load() {
    loading = true;
    error = '';
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        await goto('/login');
        return;
      }
      graph = await loadLineageGraphForUser(user.id);
    } catch (e) {
      error = e instanceof Error ? e.message : t('lineageGraphLoadFailed');
      graph = null;
    } finally {
      loading = false;
    }
  }

  function openTask(node: LineageGraphNode) {
    const id = node.role === 'sensitivity' ? node.parentRootId : node.id;
    if (!id || node.gray || !node.mine) return;
    void goto(`/app/task/${id}`);
  }

  function canOpen(node: LineageGraphNode): boolean {
    if (node.gray || !node.mine) return false;
    if (node.role === 'sensitivity') return !!node.parentRootId;
    return true;
  }

  function formatZ(node: LineageGraphNode): string {
    const z = node.result?.Z ?? node.forkSourceZ;
    if (z == null || !Number.isFinite(z)) return '—';
    return String(Math.round(z * 1000) / 1000);
  }

  onMount(() => {
    void load();
  });
</script>

<svelte:head>
  <title>{t('lineageGraph')} — Планировщик распределения ресурсов</title>
</svelte:head>

<PageHeader title={t('lineageGraph')} description={t('lineageGraphHint')} />

{#if loading}
  <p class="mt-6 text-sm text-text-muted">{t('loading')}</p>
{:else if error}
  <Card class="mt-6">
    <p class="text-sm text-danger-text">{error}</p>
    <Button class="mt-3" variant="secondary" onclick={() => void load()}>{t('retry')}</Button>
  </Card>
{:else if !graph || graph.nodes.length === 0}
  <div class="mt-6">
    <EmptyState title={t('lineageGraphEmpty')} description={t('lineageGraphEmptyHint')} />
  </div>
{:else}
  <div class="mt-6 flex flex-col gap-4 lg:flex-row lg:items-stretch">
    <div class="h-[min(70vh,560px)] min-h-[420px] flex-1">
      <LineageGraphCanvas
        nodes={canvasNodes}
        edges={canvasEdges}
        {selectedId}
        onselect={(id) => {
          selectedId = id;
        }}
      />
    </div>

    <aside class="w-full shrink-0 lg:w-80">
      {#if selected}
        <Card class="sticky top-4">
          <div class="flex items-start justify-between gap-2">
            <h2 class="text-sm font-medium text-text">{t('lineagePanelTitle')}</h2>
            <button
              type="button"
              class="text-xs text-text-muted hover:text-text"
              onclick={() => {
                selectedId = null;
              }}
            >
              {t('lineagePanelClose')}
            </button>
          </div>
          <p class="mt-2 text-sm text-text">{selected.name}</p>
          {#if selected.gray}
            <p class="mt-2 text-xs text-text-muted">{t('lineagePanelGray')}</p>
          {/if}
          <dl class="mt-4 space-y-2 text-sm">
            <div class="flex justify-between gap-2">
              <dt class="text-text-muted">{t('lineagePanelZ')}</dt>
              <dd class="font-medium text-text tabular-nums">{formatZ(selected)}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-text-muted">{t('lineagePanelType')}</dt>
              <dd class="text-text">
                {selected.role === 'root'
                  ? t('lineagePanelTypeRoot')
                  : t('lineagePanelTypeMutation')}
              </dd>
            </div>
          </dl>

          {#if selected.model && !selected.synthetic}
            <div class="mt-4 border-t border-border pt-3 text-xs text-text-muted">
              <p>
                {t('lineagePanelResources', {
                  n: String(selected.model.resources?.length ?? 0),
                })}
              </p>
              <p class="mt-1">
                {t('lineagePanelProducts', {
                  n: String(selected.model.products?.length ?? 0),
                })}
              </p>
              {#if selected.result && 'feasible' in selected.result && typeof selected.result.feasible === 'boolean'}
                <p class="mt-1">
                  {t('lineagePanelFeasible', {
                    v: selected.result.feasible
                      ? t('lineagePanelFeasibleYes')
                      : t('lineagePanelFeasibleNo'),
                  })}
                </p>
              {/if}
            </div>
          {:else if selected.gray || selected.synthetic}
            <p class="mt-4 text-xs text-text-muted">{t('lineagePanelNoModel')}</p>
          {/if}

          {#if canOpen(selected)}
            <Button class="mt-4 w-full" variant="primary" onclick={() => openTask(selected)}>
              {t('lineagePanelOpenTask')}
            </Button>
          {/if}
        </Card>
      {:else}
        <Card class="text-sm text-text-muted">
          {t('lineagePanelPick')}
        </Card>
      {/if}
    </aside>
  </div>
{/if}
