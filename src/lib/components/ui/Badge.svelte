<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

  let {
    variant = 'neutral',
    class: className = '',
    children,
  }: {
    variant?: Variant;
    class?: string;
    children?: Snippet;
  } = $props();

  const variants: Record<Variant, string> = {
    neutral: 'bg-surface text-text-muted',
    brand: 'bg-brand-soft text-info-text',
    success: 'bg-success-bg text-success-text',
    warning: 'bg-warning-bg text-warning-text',
    danger: 'bg-danger-bg text-danger-text',
    info: 'bg-info-bg text-info-text',
  };
</script>

<span
  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {variants[
    variant
  ]} {className}"
>
  {@render children?.()}
</span>
