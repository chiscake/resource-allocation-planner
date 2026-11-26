<script lang="ts">
  import { Loader2 } from '@lucide/svelte';
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';
  import InlineAlert from '$lib/components/ui/InlineAlert.svelte';

  let {
    refreshing = false,
    message = '',
    tone = 'warning',
    onretry,
    class: className = '',
  }: {
    refreshing?: boolean;
    message?: string;
    tone?: 'danger' | 'warning' | 'muted';
    onretry?: () => void;
    class?: string;
  } = $props();
</script>

{#if refreshing}
  <div
    class="flex items-center gap-2 text-sm text-text-muted {className}"
    role="status"
    aria-live="polite"
  >
    <Loader2 size={16} strokeWidth={1.75} class="shrink-0 animate-spin" aria-hidden="true" />
    <span>{t('listRefreshing')}</span>
  </div>
{:else if message}
  <div class="flex flex-wrap items-center gap-3 {className}">
    <InlineAlert {tone} class="min-w-0 flex-1">{message}</InlineAlert>
    {#if onretry}
      <Button variant="secondary" onclick={onretry}>{t('retry')}</Button>
    {/if}
  </div>
{/if}
