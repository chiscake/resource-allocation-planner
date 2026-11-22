<script lang="ts">
  let {
    tone = 'danger',
    children,
    class: className = '',
  }: {
    tone?: 'danger' | 'warning' | 'muted';
    children: import('svelte').Snippet;
    class?: string;
  } = $props();

  const tones = {
    danger: 'bg-danger-bg text-danger-text',
    warning: 'bg-warning-bg text-warning-text',
    muted: 'bg-surface text-text-muted',
  } as const;
</script>

<p class="rounded-[8px] px-3 py-2 text-sm {tones[tone]} {className}">
  {@render children()}
</p>
