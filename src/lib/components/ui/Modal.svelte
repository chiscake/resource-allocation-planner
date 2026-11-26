<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade } from 'svelte/transition';
  import { portalToBody } from '$lib/components/ui/portal';

  type ModalSize = 'md' | 'xl';

  let {
    open = $bindable(false),
    title = '',
    size = 'md',
    describedBy,
    dismissible = true,
    onclose,
    children,
  }: {
    open?: boolean;
    title?: string;
    size?: ModalSize;
    describedBy?: string;
    dismissible?: boolean;
    onclose?: () => void;
    children?: Snippet;
  } = $props();

  const titleId = $props.id();

  const widthClass = $derived(size === 'xl' ? 'max-w-3xl' : 'max-w-lg');

  function close() {
    if (!dismissible) return;
    open = false;
    onclose?.();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      close();
    }
  }

  $effect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  });
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
    role="presentation"
    transition:fade={{ duration: 150 }}
    {@attach portalToBody}
  >
    <button
      type="button"
      class="absolute inset-0 cursor-default border-0 bg-[rgba(10,10,10,0.5)] p-0"
      aria-label={title ? undefined : 'Close'}
      onclick={close}
    ></button>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={describedBy}
      class="relative z-10 flex w-full {widthClass} max-h-[min(90dvh,56rem)] flex-col rounded-t-[12px] border border-border bg-bg px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-[12px] sm:p-6 sm:pb-6"
    >
      {#if title}
        <h2 id={titleId} class="mb-4 shrink-0 pr-2 text-lg font-medium text-text">{title}</h2>
      {/if}
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}
