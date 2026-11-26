<script lang="ts">
  import { stubLineageGraph } from '$lib/domain';
  import { t } from '$lib/i18n';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import LineageGraphCanvas from '$lib/components/graph/LineageGraphCanvas.svelte';

  const graph = stubLineageGraph();
  let selectedId = $state<string | null>(null);

  const selected = $derived(
    selectedId ? (graph.nodes.find((n) => n.id === selectedId) ?? null) : null,
  );

  const canvasNodes = graph.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    role: n.role,
    gray: n.gray,
  }));

  const canvasEdges = graph.edges.map((e) => ({
    id: e.id,
    fromId: e.fromId,
    toId: e.toId,
    kind: e.kind,
  }));
</script>

<svelte:head>
  <title>{t('lineageTestTitle')} — Планировщик распределения ресурсов</title>
</svelte:head>

<PageHeader title={t('lineageTestTitle')} description={t('lineageTestHint')} />

<div class="mt-6 flex flex-col gap-4 lg:flex-row">
  <div class="h-[min(70vh,560px)] min-h-[320px] flex-1">
    <LineageGraphCanvas
      nodes={canvasNodes}
      edges={canvasEdges}
      {selectedId}
      onselect={(id) => {
        selectedId = id;
      }}
    />
  </div>
  <aside class="w-full lg:w-72">
    <Card class="text-sm">
      {#if selected}
        <p class="font-medium text-text">{selected.name}</p>
        <p class="mt-2 text-text-muted">id: {selected.id}</p>
        <p class="mt-1 text-text-muted">
          {t('lineagePanelZ')}: {selected.result?.Z ?? '—'}
        </p>
      {:else}
        <p class="text-text-muted">{t('lineagePanelPick')}</p>
      {/if}
    </Card>
  </aside>
</div>
