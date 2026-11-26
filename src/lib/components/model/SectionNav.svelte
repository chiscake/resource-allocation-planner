<script lang="ts">
  import { ChevronDown, List } from '@lucide/svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { prefersReducedMotion } from 'svelte/motion';
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';
  import { CHROME_MD } from '$lib/chrome/chrome.svelte';
  import type { SectionNavId, SectionNavItem } from './section-nav';

  let {
    items,
    onNavigate,
  }: {
    items: SectionNavItem[];
    onNavigate: (id: SectionNavId) => void | Promise<void>;
  } = $props();

  const desktop = new MediaQuery(`(min-width: ${CHROME_MD}px)`);

  /** null → default (desktop open, mobile collapsed); set by user toggle / mobile jump. */
  let manualOpen = $state<boolean | null>(null);
  const open = $derived(manualOpen ?? desktop.current);

  let busy = $state(false);

  const reduceMotion = $derived(prefersReducedMotion.current);
  const panelDuration = $derived(reduceMotion ? 0 : 220);

  async function handleNavigate(id: SectionNavId) {
    if (busy) return;
    busy = true;
    try {
      await onNavigate(id);
      // Collapse after jump on mobile so the user can scroll; keep desktop aside open.
      if (!desktop.current) manualOpen = false;
    } finally {
      busy = false;
    }
  }

  function toggle() {
    manualOpen = !open;
  }
</script>

{#snippet header(controlsId: string)}
  <div class="flex items-center justify-between gap-2 py-1.5 pr-1.5 pl-3">
    <div class="flex min-w-0 items-center gap-2">
      <List class="size-4 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
      <span class="truncate text-xs font-medium text-text-muted">{t('sectionNavLabel')}</span>
    </div>
    <Button
      variant="ghost"
      class="px-2! py-1! text-xs"
      aria-expanded={open}
      aria-controls={controlsId}
      disabled={busy}
      onclick={toggle}
    >
      {open ? t('sectionNavCollapse') : t('sectionNavExpand')}
      <ChevronDown
        class={[
          'size-3.5 shrink-0 transition-transform duration-200',
          open && 'rotate-180',
          reduceMotion && 'transition-none',
        ]}
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </Button>
  </div>
{/snippet}

{#snippet links(vertical: boolean)}
  <ul
    class={[
      vertical ? 'flex flex-col gap-0.5 px-1.5 pb-2' : 'flex flex-wrap gap-1 px-2 pb-2',
      'pt-0.5',
    ]}
    role="list"
  >
    {#each items as item (item.id)}
      <li>
        <button
          type="button"
          class={[
            'inline-flex cursor-pointer items-center rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-text-muted transition-colors duration-200 hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
            vertical && 'w-full',
          ]}
          disabled={busy}
          onclick={() => void handleNavigate(item.id)}
        >
          {item.label}
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet collapsiblePanel(controlsId: string, vertical: boolean)}
  <div
    id={controlsId}
    class={[
      'grid ease-[cubic-bezier(0.16,1,0.3,1)]',
      reduceMotion ? 'transition-none' : 'transition-[grid-template-rows]',
    ]}
    style:grid-template-rows={open ? '1fr' : '0fr'}
    style:transition-duration="{panelDuration}ms"
  >
    <div class="min-h-0 overflow-hidden">
      <div class="border-t border-border-soft">
        {@render links(vertical)}
      </div>
    </div>
  </div>
{/snippet}

{#if items.length}
  {#if desktop.current}
    <!-- Desktop: compact floating aside (right), not a full-width bar. -->
    <nav
      class="pointer-events-none fixed top-[calc(3.5rem+1rem)] right-5 z-30 w-44"
      aria-label={t('sectionNavLabel')}
    >
      <div class="pointer-events-auto rounded-[12px] border border-border bg-bg shadow-sm">
        {@render header('section-nav-list')}
        {@render collapsiblePanel('section-nav-list', true)}
      </div>
    </nav>
  {:else}
    <!-- Mobile: in-flow sticky card under AppHeader (never overlays header chrome). -->
    <nav class="sticky top-0 z-20" aria-label={t('sectionNavLabel')}>
      <div class="rounded-[12px] border border-border bg-bg shadow-sm">
        {@render header('section-nav-list')}
        {@render collapsiblePanel('section-nav-list', false)}
      </div>
    </nav>
  {/if}
{/if}
