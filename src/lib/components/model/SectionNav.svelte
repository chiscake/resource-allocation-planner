<script lang="ts">
  import { ChevronDown, List } from '@lucide/svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { prefersReducedMotion } from 'svelte/motion';
  import { t } from '$lib/i18n';
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
  let rootEl: HTMLElement | null = $state(null);

  const reduceMotion = $derived(prefersReducedMotion.current);
  const panelDuration = $derived(reduceMotion ? 0 : 220);

  /** Collapsed bar / island height — also used as page top padding so chrome clears the island. */
  const BAR_HEIGHT = '2.75rem';
  /** Desktop island top inset inside main (matches main p-6). */
  const DESKTOP_INSET = '1.5rem';

  $effect(() => {
    const main = rootEl?.closest('main') ?? document.querySelector('main');
    const section = rootEl?.closest('section');
    if (!items.length) {
      main?.style.removeProperty('--section-nav-scroll-mt');
      section?.style.removeProperty('padding-top');
      return;
    }

    if (desktop.current) {
      // Align jumped sections with the floating island top (same level).
      main?.style.setProperty('--section-nav-scroll-mt', DESKTOP_INSET);
      // Reserve top space so title/actions sit below the collapsed island.
      section?.style.setProperty('padding-top', BAR_HEIGHT);
    } else {
      // Mobile navbar height under AppHeader.
      main?.style.setProperty('--section-nav-scroll-mt', BAR_HEIGHT);
      section?.style.setProperty('padding-top', BAR_HEIGHT);
    }

    return () => {
      main?.style.removeProperty('--section-nav-scroll-mt');
      section?.style.removeProperty('padding-top');
    };
  });

  async function handleNavigate(id: SectionNavId) {
    if (busy) return;
    busy = true;
    try {
      await onNavigate(id);
      if (!desktop.current) manualOpen = false;
    } finally {
      busy = false;
    }
  }

  function toggle() {
    manualOpen = !open;
  }
</script>

{#snippet headerRow(controlsId: string)}
  <button
    type="button"
    class="flex w-full cursor-pointer items-center justify-between gap-2 py-1.5 pr-2 pl-3 text-left transition-colors duration-200 hover:bg-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
    aria-expanded={open}
    aria-controls={controlsId}
    disabled={busy}
    onclick={toggle}
  >
    <span class="flex min-w-0 items-center gap-2">
      <List class="size-4 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
      <span class="truncate text-xs font-medium text-text-muted">{t('sectionNavLabel')}</span>
    </span>
    <span class="flex shrink-0 items-center gap-1 text-xs font-medium text-text-muted">
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
    </span>
  </button>
{/snippet}

{#snippet links(vertical: boolean)}
  <ul
    class={[
      vertical ? 'flex flex-col gap-0.5 px-1.5 pb-2' : 'flex flex-wrap gap-1 px-3 pb-2',
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
  <div
    bind:this={rootEl}
    class="pointer-events-none absolute h-0 w-0 overflow-hidden"
    aria-hidden="true"
  ></div>

  {#if desktop.current}
    <!-- Desktop: fixed-width floating aside; top inset matches main padding. -->
    <nav
      class="pointer-events-none fixed top-[calc(3.5rem+1.5rem)] right-5 z-30 w-56"
      aria-label={t('sectionNavLabel')}
    >
      <div class="pointer-events-auto rounded-[12px] border border-border bg-bg shadow-sm">
        {@render headerRow('section-nav-list')}
        {@render collapsiblePanel('section-nav-list', true)}
      </div>
    </nav>
  {:else}
    <!-- Mobile: classic navbar flush under AppHeader. -->
    <nav
      class="fixed top-14 right-0 left-0 z-20 border-b border-border bg-bg shadow-sm"
      aria-label={t('sectionNavLabel')}
    >
      {@render headerRow('section-nav-list')}
      {@render collapsiblePanel('section-nav-list', false)}
    </nav>
  {/if}
{/if}
