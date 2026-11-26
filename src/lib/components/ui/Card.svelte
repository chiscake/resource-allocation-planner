<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'default' | 'soft';

  let {
    variant = 'default',
    padding = true,
    class: className = '',
    children,
  }: {
    variant?: Variant;
    padding?: boolean;
    class?: string;
    children?: Snippet;
  } = $props();

  const variants: Record<Variant, string> = {
    default: 'border border-border bg-bg',
    soft: 'border border-border bg-bg-soft',
  };
</script>

<div class="rounded-[12px] {variants[variant]} {padding ? 'p-5 md:p-6' : ''} {className}">
  {@render children?.()}
</div>
