<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    description,
    class: className = '',
    action,
  }: {
    title: string;
    description?: string;
    class?: string;
    action?: Snippet;
  } = $props();
</script>

<div
  class="flex flex-col items-center justify-center gap-3 rounded-[12px] border border-border bg-bg-soft px-6 py-12 text-center {className}"
>
  <p class="text-base font-medium text-text">{title}</p>
  {#if description}
    <p class="max-w-sm text-sm text-text-muted">{description}</p>
  {/if}
  {#if action}
    <div class="mt-2">
      {@render action()}
    </div>
  {/if}
</div>
