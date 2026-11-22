<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';

  type Tone = 'secondary' | 'danger';

  let {
    tone = 'secondary',
    disabled = false,
    href,
    onclick,
    title,
    'aria-label': ariaLabel,
    class: className = '',
    children,
  }: {
    tone?: Tone;
    disabled?: boolean;
    href?: string;
    onclick?: (event: MouseEvent) => void;
    title?: string;
    'aria-label'?: string;
    class?: string;
    children?: Snippet;
  } = $props();

  const toneClass = $derived(
    tone === 'danger' ? 'text-danger-text! hover:bg-danger-bg! hover:text-danger-text!' : '',
  );
</script>

<Button
  variant="ghost"
  class="px-2.5! py-2.5! {toneClass} {className}"
  {disabled}
  {href}
  {onclick}
  {title}
  aria-label={ariaLabel}
>
  {@render children?.()}
</Button>
