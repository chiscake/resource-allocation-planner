<script lang="ts">
  import { supabase } from '$lib/db/supabase';
  import {
    COMPARE_MAX_IDS,
    KIND_SENSITIVITY,
    KIND_WHAT_IF_BASE,
    formatMutationLabel,
    modelsEqual,
    type Model,
    type Mutation,
  } from '$lib/domain';
  import { t } from '$lib/i18n';
  import Modal from '$lib/components/ui/Modal.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  type ChildRow = {
    id: string;
    title: string;
    kind: string;
    parent_id: string;
    what_if_generation: number | null;
    mutation: Mutation | null;
    model: Model;
    result: unknown;
  };

  type RootRow = {
    id: string;
    title: string;
    model: Model;
    result: unknown;
    children: ChildRow[];
  };

  let {
    open = $bindable(false),
    initialIds = [] as string[],
    onconfirm,
  }: {
    open?: boolean;
    initialIds?: string[];
    onconfirm?: (ids: string[]) => void;
  } = $props();

  let loading = $state(false);
  let roots = $state<RootRow[]>([]);
  let draft = $state<string[]>([]);
  let loadError = $state('');

  const atMax = $derived(draft.length >= COMPARE_MAX_IDS);

  $effect(() => {
    if (!open) return;
    draft = [...initialIds].slice(0, COMPARE_MAX_IDS);
    void loadTree();
  });

  async function loadTree() {
    loading = true;
    loadError = '';
    try {
      const { data: rootData, error: rootErr } = await supabase
        .from('solve_nodes')
        .select('id, title, model, result')
        .is('parent_id', null)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      if (rootErr) throw rootErr;

      const rootList = (rootData ?? []) as Omit<RootRow, 'children'>[];
      const rootIds = rootList.map((r) => r.id);
      let childList: ChildRow[] = [];
      if (rootIds.length) {
        const { data: kids, error: kidErr } = await supabase
          .from('solve_nodes')
          .select('id, title, kind, parent_id, what_if_generation, mutation, model, result')
          .in('parent_id', rootIds)
          .is('deleted_at', null)
          .order('what_if_generation', { ascending: true });
        if (kidErr) throw kidErr;
        childList = (kids ?? []) as ChildRow[];
      }

      roots = rootList.map((r) => {
        const kids = childList.filter((c) => c.parent_id === r.id);
        const visible = kids.filter((c) => {
          if (c.kind === KIND_SENSITIVITY) return true;
          if (c.kind === KIND_WHAT_IF_BASE) {
            return r.model && c.model ? !modelsEqual(c.model, r.model) : false;
          }
          return false;
        });
        return { ...r, children: visible };
      });
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
      roots = [];
    } finally {
      loading = false;
    }
  }

  function isSelected(id: string): boolean {
    return draft.includes(id);
  }

  function isPrimary(id: string): boolean {
    return draft[0] === id;
  }

  function toggle(id: string) {
    if (isSelected(id)) {
      draft = draft.filter((x) => x !== id);
      return;
    }
    if (draft.length >= COMPARE_MAX_IDS) return;
    draft = [...draft, id];
  }

  function makePrimary(id: string) {
    if (!isSelected(id)) {
      if (draft.length >= COMPARE_MAX_IDS) return;
      draft = [id, ...draft];
      return;
    }
    draft = [id, ...draft.filter((x) => x !== id)];
  }

  function childLabel(root: RootRow, child: ChildRow): string {
    if (child.kind === KIND_WHAT_IF_BASE) {
      const n = child.what_if_generation ?? 0;
      return t('compareBaseStep', { n: String(n) });
    }
    if (child.mutation) {
      return formatMutationLabel(child.mutation, root.model);
    }
    return child.title || child.id.slice(0, 8);
  }

  function confirm() {
    if (!draft.length) return;
    onconfirm?.(draft);
    open = false;
  }

  function cancel() {
    open = false;
  }
</script>

<Modal bind:open title={t('comparePickerTitle')} size="xl" onclose={cancel}>
  <div class="space-y-4">
    {#if loading}
      <p class="text-sm text-text-muted">{t('compareLoading')}</p>
    {:else if loadError}
      <p class="text-sm text-danger-text">{loadError}</p>
    {:else if roots.length === 0}
      <p class="text-sm text-text-muted">{t('compareNoSelection')}</p>
    {:else}
      {#if atMax}
        <p class="text-xs text-text-muted">{t('compareMaxReached')}</p>
      {/if}
      <ul class="space-y-3">
        {#each roots as root (root.id)}
          <li class="rounded-[8px] border border-border-soft p-3">
            <div class="flex flex-wrap items-center gap-2">
              <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="size-4 accent-brand"
                  checked={isSelected(root.id)}
                  disabled={!isSelected(root.id) && atMax}
                  onchange={() => toggle(root.id)}
                />
                <span class="truncate font-medium">{root.title || t('compareRootLabel')}</span>
                {#if isPrimary(root.id)}
                  <span class="rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand">
                    {t('comparePrimaryBadge')}
                  </span>
                {/if}
              </label>
              {#if isSelected(root.id) && !isPrimary(root.id)}
                <Button
                  variant="ghost"
                  class="px-2! py-1! text-xs"
                  onclick={() => makePrimary(root.id)}
                >
                  {t('compareMakePrimary')}
                </Button>
              {/if}
            </div>
            {#if root.children.length}
              <ul class="mt-2 space-y-1.5 border-l border-border-soft pl-4">
                {#each root.children as child (child.id)}
                  <li class="flex flex-wrap items-center gap-2">
                    <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        class="size-4 accent-brand"
                        checked={isSelected(child.id)}
                        disabled={!isSelected(child.id) && atMax}
                        onchange={() => toggle(child.id)}
                      />
                      <span class="truncate text-text-muted">{childLabel(root, child)}</span>
                      {#if isPrimary(child.id)}
                        <span class="rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand">
                          {t('comparePrimaryBadge')}
                        </span>
                      {/if}
                    </label>
                    {#if isSelected(child.id) && !isPrimary(child.id)}
                      <Button
                        variant="ghost"
                        class="px-2! py-1! text-xs"
                        onclick={() => makePrimary(child.id)}
                      >
                        {t('compareMakePrimary')}
                      </Button>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <div class="flex justify-end gap-2 border-t border-border-soft pt-4">
      <Button variant="ghost" onclick={cancel}>{t('comparePickerCancel')}</Button>
      <Button disabled={!draft.length} onclick={confirm}>{t('comparePickerConfirm')}</Button>
    </div>
  </div>
</Modal>
