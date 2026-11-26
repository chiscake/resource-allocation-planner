<script lang="ts">
  import { ChevronDown, List } from '@lucide/svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { prefersReducedMotion } from 'svelte/motion';
  import { t } from '$lib/i18n';
  import { CHROME_MD } from '$lib/chrome/chrome.svelte';
  import {
    flattenSectionNavItems,
    SECTION_NAV_BAR_HEIGHT,
    SECTION_NAV_GAP,
    type SectionNavId,
    type SectionNavItem,
  } from './section-nav';

  let {
    items,
    onNavigate,
  }: {
    items: SectionNavItem[];
    onNavigate: (id: SectionNavId) => void | Promise<void>;
  } = $props();

  const desktop = new MediaQuery(`(min-width: ${CHROME_MD}px)`);

  /** Always starts collapsed (desktop + mobile). */
  let open = $state(false);

  let busy = $state(false);
  let rootEl: HTMLElement | null = $state(null);

  const reduceMotion = $derived(prefersReducedMotion.current);
  const panelDuration = $derived(reduceMotion ? 0 : 220);
  const flatItems = $derived(flattenSectionNavItems(items));

  $effect(() => {
    const main = rootEl?.closest('main') ?? document.querySelector('main');
    // Page shell section (not the inner SolveWorkspace <section>).
    const pageSection =
      rootEl?.closest('main > section') ??
      (main instanceof HTMLElement ? main.querySelector(':scope > section') : null);
    const pageHeader =
      pageSection instanceof HTMLElement ? pageSection.querySelector(':scope > header') : null;

    const clear = () => {
      main?.style.removeProperty('--section-nav-scroll-mt');
      if (pageHeader instanceof HTMLElement) pageHeader.style.removeProperty('padding-top');
      if (pageSection instanceof HTMLElement) pageSection.style.removeProperty('padding-top');
    };

    if (!items.length) {
      clear();
      return;
    }

    if (desktop.current) {
      // Approximate top stop; click scroll uses center-to-center in scrollToSection.
      main?.style.setProperty('--section-nav-scroll-mt', SECTION_NAV_GAP);
    } else {
      // Nav bar height + p-6 breathing room under the sticky island.
      main?.style.setProperty(
        '--section-nav-scroll-mt',
        `calc(${SECTION_NAV_BAR_HEIGHT} + ${SECTION_NAV_GAP})`,
      );
    }

    // Clearance under the island: bar height; desktop also +p-6 so title/actions sit lower.
    const headerPad = desktop.current
      ? `calc(${SECTION_NAV_BAR_HEIGHT} + ${SECTION_NAV_GAP})`
      : SECTION_NAV_BAR_HEIGHT;

    // Prefer PageHeader; fall back to page section (e.g. guest without title chrome).
    if (pageHeader instanceof HTMLElement) {
      pageHeader.style.setProperty('padding-top', headerPad);
      if (pageSection instanceof HTMLElement) pageSection.style.removeProperty('padding-top');
    } else if (pageSection instanceof HTMLElement) {
      pageSection.style.setProperty('padding-top', headerPad);
    }

    return clear;
  });

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

  function toggle() {
    open = !open;
  }
</script>

{#snippet headerRow(controlsId: string)}
  <button
    type="button"
    data-section-nav-header
    class="flex h-10 w-full cursor-pointer items-center justify-between gap-2 pr-2 pl-3 text-left text-sm font-medium transition-colors duration-200 hover:bg-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
    aria-expanded={open}
    aria-controls={controlsId}
    disabled={busy}
    onclick={toggle}
  >
    <span class="flex min-w-0 items-center gap-2">
      <List class="size-4 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
      <span class="truncate text-text-muted">{t('sectionNavLabel')}</span>
    </span>
    <span class="flex shrink-0 items-center gap-1 text-text-muted">
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

{#snippet links()}
  <ul class="flex flex-col gap-0.5 p-2" role="list">
    {#each flatItems as item (item.id)}
      <li class={item.depth > 0 ? 'pl-3' : ''}>
        <button
          type="button"
          class={[
            'inline-flex w-full cursor-pointer items-center rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors duration-200 hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
            item.depth > 0 ? 'text-text-soft' : 'text-text-muted',
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

{#snippet collapsiblePanel(controlsId: string)}
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
        {@render links()}
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
      class="pointer-events-none fixed top-[calc(3.5rem+1.5rem)] right-5 z-30 w-64"
      aria-label={t('sectionNavLabel')}
    >
      <div class="pointer-events-auto rounded-[12px] border border-border bg-bg shadow-sm">
        {@render headerRow('section-nav-list')}
        {@render collapsiblePanel('section-nav-list')}
      </div>
    </nav>
  {:else}
    <!-- Mobile: classic navbar flush under AppHeader; list same vertical tree as desktop. -->
    <nav
      class="fixed top-14 right-0 left-0 z-20 border-b border-border bg-bg shadow-sm"
      aria-label={t('sectionNavLabel')}
    >
      {@render headerRow('section-nav-list')}
      {@render collapsiblePanel('section-nav-list')}
    </nav>
  {/if}
{/if}
