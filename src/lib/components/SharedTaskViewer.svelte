<script lang="ts">
  import type { Model, Mutation, SolveResult } from '$lib/domain';
  import {
    buildWhatIfRowData,
    collectGenerations,
    findBaseForGeneration,
    sensitivityForGeneration,
  } from '$lib/domain';
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import InlineAlert from '$lib/components/ui/InlineAlert.svelte';
  import ResultViewer from '$lib/components/ResultViewer.svelte';
  import NodeComments, { type PublicCommentRow } from '$lib/components/NodeComments.svelte';
  import LpModelMatrix from '$lib/components/model/LpModelMatrix.svelte';
  import { GitFork } from '@lucide/svelte';

  type ChildRow = {
    id: string;
    title: string;
    kind: string;
    model: Model;
    result: SolveResult | null;
    mutation: Mutation | null;
    what_if_generation: number | null;
    deleted_at: string | null;
  };

  let {
    title,
    model,
    result,
    children = [],
    nodeId = '',
    isNodeOwner = false,
    hint = '',
    busy = false,
    showFork = true,
    showComments = true,
    commentsReadOnly = false,
    shareToken = '',
    initialComments = null,
    onFork,
  }: {
    title: string;
    model: Model;
    result: SolveResult | null;
    children?: ChildRow[];
    nodeId?: string;
    isNodeOwner?: boolean;
    hint?: string;
    busy?: boolean;
    showFork?: boolean;
    showComments?: boolean;
    commentsReadOnly?: boolean;
    shareToken?: string;
    initialComments?: PublicCommentRow[] | null;
    onFork?: () => void;
  } = $props();

  const liveChildren = $derived(children.filter((c) => !c.deleted_at));
  const generations = $derived(collectGenerations(liveChildren));
  let genIndex = $state(0);

  const activeGen = $derived(generations[genIndex] ?? null);
  const generationBase = $derived(
    activeGen != null ? findBaseForGeneration(liveChildren, activeGen) : null,
  );
  const displayModel = $derived(generationBase?.model ?? model);
  const displayResult = $derived(generationBase?.result ?? result);
  const sensitivity = $derived(
    activeGen != null ? sensitivityForGeneration(liveChildren, activeGen) : [],
  );
  const whatIfRows = $derived(
    sensitivity.flatMap((c) => {
      if (!c.mutation) return [];
      return [
        buildWhatIfRowData({
          base: displayModel,
          baseResult: displayResult,
          mutation: c.mutation,
          mutatedModel: c.model,
          result: c.result,
          valuesFromMutated: true,
        }),
      ];
    }),
  );
</script>

<div class="flex flex-col gap-6">
  {#if hint}
    <InlineAlert tone="muted">{hint}</InlineAlert>
  {/if}

  {#if showFork && onFork}
    <div class="flex flex-wrap gap-2">
      <Button variant="secondary" disabled={busy} onclick={onFork}>
        <GitFork size={16} strokeWidth={1.75} aria-hidden="true" />
        {t('fork')}
      </Button>
    </div>
  {/if}

  <Card>
    <ResultViewer {title} result={displayResult} />
  </Card>

  <Card>
    <h2 class="mb-3 text-lg font-medium">{t('modelMatrix')}</h2>
    <LpModelMatrix model={displayModel} readonly />
  </Card>

  <Card>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-medium">{t('whatIfReadonlyTitle')}</h2>
      {#if generations.length > 0}
        <div class="flex items-center gap-2">
          <Button
            variant="secondary"
            class="px-2! py-1!"
            disabled={genIndex <= 0}
            onclick={() => (genIndex = Math.max(0, genIndex - 1))}
          >
            ←
          </Button>
          <span class="text-xs text-text-muted">
            {t('whatIfGenerationLabel', { n: String(activeGen ?? 1) })}
            / {generations.length}
          </span>
          <Button
            variant="secondary"
            class="px-2! py-1!"
            disabled={genIndex >= generations.length - 1}
            onclick={() => (genIndex = Math.min(generations.length - 1, genIndex + 1))}
          >
            →
          </Button>
        </div>
      {/if}
    </div>
    {#if generations.length === 0}
      <p class="text-sm text-text-muted">{t('whatIfReadonlyEmpty')}</p>
    {:else if whatIfRows.length === 0}
      <p class="text-sm text-text-muted">{t('whatIfReadonlyEmpty')}</p>
    {:else}
      <ul class="flex flex-col gap-2">
        {#each whatIfRows as row, i (row.title + String(i))}
          <li class="rounded-[8px] border border-border-soft bg-bg-soft px-3 py-2 text-sm">
            <p class="font-medium text-text">{row.title}</p>
            <p class="mt-1 font-mono text-xs text-text-muted">
              Z = {Number.isFinite(row.Z) ? row.Z.toFixed(4) : '—'}
              {#if Number.isFinite(row.deltaZ)}
                · ΔZ = {row.deltaZ >= 0 ? '+' : ''}{row.deltaZ.toFixed(4)}
              {/if}
            </p>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>

  {#if showComments}
    <Card>
      <NodeComments
        {nodeId}
        {isNodeOwner}
        readOnly={commentsReadOnly}
        {shareToken}
        {initialComments}
      />
    </Card>
  {/if}
</div>
