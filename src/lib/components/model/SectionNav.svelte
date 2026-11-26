<script lang="ts">
  import { ChevronDown, List } from '@lucide/svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';
  import type { SectionNavId, SectionNavItem } from './section-nav';

  let {
    items,
    onNavigate,
  }: {
    items: SectionNavItem[];
    onNavigate: (id: SectionNavId) => void | Promise<void>;
  } = $props();

  let open = $state(false);
  let busy = $state(false);

  async function handleNavigate(id: SectionNavId) {
    if (busy) return;
    busy = true;
    try {
      await onNavigate(id);
      open = false;
    } finally {
      busy = false;
    }
  }
</script>

{#if items.length}
  <nav
    class="sticky top-0 z-30 border-b border-border bg-bg-soft/95 backdrop-blur-sm"
    aria-label={t('sectionNavLabel')}
  >
    <div class="flex items-center justify-between gap-2 py-1.5">
      <div class="flex min-w-0 items-center gap-2">
        <List class="size-4 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
        <span class="truncate text-xs font-medium text-text-muted">{t('sectionNavLabel')}</span>
      </div>
      <Button
        variant="ghost"
        class="px-2! py-1! text-xs"
        aria-expanded={open}
        aria-controls="section-nav-list"
        disabled={busy}
        onclick={() => (open = !open)}
      >
        {open ? t('sectionNavCollapse') : t('sectionNavExpand')}
        <ChevronDown
          class={[
            'size-3.5 shrink-0 transition-transform duration-200',
            open && 'rotate-180',
            prefersReducedMotion.current && 'transition-none',
          ]}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </Button>
    </div>

    {#if open}
      <ul
        id="section-nav-list"
        class="flex flex-wrap gap-1 border-t border-border-soft py-2"
        role="list"
      >
        {#each items as item (item.id)}
          <li>
            <button
              type="button"
              class="inline-flex cursor-pointer items-center rounded-md px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors duration-200 hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              disabled={busy}
              onclick={() => void handleNavigate(item.id)}
            >
              {item.label}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </nav>
{/if}
