<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Pen } from '@lucide/svelte';
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';

  let {
    title,
    description,
    meta,
    editable = false,
    /** On max-md, stack actions under the title; md+ stays title | actions. */
    actionsBelowMobile = false,
    class: className = '',
    actions,
    ontitlecommit,
  }: {
    title: string;
    description?: string;
    /** Small hint under the title (e.g. last saved). Shown before description. */
    meta?: string;
    /** Double-click / Enter|F2 when focused → rename; ghost pen also starts edit. */
    editable?: boolean;
    /** Stack action buttons on their own row below md; desktop unchanged. */
    actionsBelowMobile?: boolean;
    class?: string;
    actions?: Snippet;
    /** Persist new title (blur / Enter). Empty → cancel. */
    ontitlecommit?: (next: string) => void | Promise<void>;
  } = $props();

  let editing = $state(false);
  let draft = $state('');
  let inputEl: HTMLInputElement | undefined = $state();

  function startEdit() {
    if (!editable || editing) return;
    draft = title;
    editing = true;
    queueMicrotask(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }

  async function commitEdit() {
    if (!editing) return;
    editing = false;
    const next = draft.trim();
    if (!next || next === title) return;
    await ontitlecommit?.(next);
  }

  function cancelEdit() {
    editing = false;
    draft = title;
  }

  function onTitleKeydown(e: KeyboardEvent) {
    if (!editable || editing) return;
    if (e.key === 'Enter' || e.key === 'F2' || e.key === 'Tab') {
      e.preventDefault();
      startEdit();
    }
  }

  function onInputKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }
</script>

<header
  class="flex flex-wrap gap-4 {actionsBelowMobile
    ? 'max-md:flex-col max-md:items-stretch md:flex-row md:items-center md:justify-between'
    : 'items-center justify-between'} {className}"
>
  <div class="min-w-0 flex-1 {actionsBelowMobile ? 'max-md:w-full max-md:flex-none' : ''}">
    {#if editing}
      <input
        bind:this={inputEl}
        bind:value={draft}
        class="w-full max-w-xl rounded-[8px] border border-border-focus bg-bg px-2 py-1 text-3xl font-medium tracking-tight text-text outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        aria-label="Название задачи"
        onblur={() => void commitEdit()}
        onkeydown={onInputKeydown}
      />
    {:else if editable}
      <div class="flex min-w-0 items-center gap-0.5">
        <h1 class="min-w-0 max-w-full text-3xl font-medium tracking-tight text-text">
          <button
            type="button"
            class="block max-w-full truncate text-left cursor-text rounded-[4px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
            ondblclick={startEdit}
            onkeydown={onTitleKeydown}
            title="Двойной клик или Tab/Enter — переименовать"
          >
            {title}
          </button>
        </h1>
        <Button
          variant="ghost"
          class="px-2! py-2! shrink-0 text-text-soft opacity-35 hover:opacity-100 hover:text-text-muted"
          aria-label={t('editTitle')}
          title={t('editTitle')}
          onclick={startEdit}
        >
          <Pen size={16} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
    {:else}
      <h1 class="text-3xl font-medium tracking-tight text-text">{title}</h1>
    {/if}
    {#if meta}
      <p class="mt-1 text-xs text-text-soft">{meta}</p>
    {/if}
    {#if description}
      <p class="mt-1 text-sm text-text-muted">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div
      class="flex shrink-0 flex-wrap items-center gap-2 {actionsBelowMobile
        ? 'max-md:w-full max-md:justify-end'
        : ''}"
    >
      {@render actions()}
    </div>
  {/if}
</header>
