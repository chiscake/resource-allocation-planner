<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { X } from '@lucide/svelte';
  import { supabase } from '$lib/db/supabase';
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import { chrome, closeNotifications, setUnread } from '$lib/chrome/chrome.svelte';

  type N = {
    id: string;
    title: string;
    type: string;
    body: string | null;
    read_at: string | null;
    created_at: string;
    entity_type: string | null;
    entity_id: string | null;
  };

  const FOCUSABLE =
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

  let items = $state<N[]>([]);
  let panelEl = $state<HTMLDivElement | null>(null);
  let previouslyFocused: HTMLElement | null = null;

  const unreadCount = $derived(items.filter((n) => !n.read_at).length);

  function getFocusable(root: HTMLElement | null): HTMLElement[] {
    if (!root) return [];
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
    );
  }

  function taskHref(n: N): string | null {
    if (n.entity_type === 'solve_node' && n.entity_id) {
      return `/app/task/${n.entity_id}`;
    }
    return null;
  }

  async function refreshUnread() {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .is('read_at', null);
    setUnread(count ?? 0);
  }

  async function loadItems() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    items = (data ?? []) as N[];
    await refreshUnread();
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    await loadItems();
  }

  async function markAllRead() {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null);
    await loadItems();
  }

  async function openNotification(n: N) {
    if (!n.read_at) {
      await markRead(n.id);
    }
    const href = taskHref(n);
    if (href) {
      closeNotifications();
      await goto(href);
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (!chrome.notificationsOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeNotifications();
      return;
    }

    if (e.key !== 'Tab' || !panelEl) return;

    const focusables = getFocusable(panelEl);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (e.shiftKey) {
      if (active === first || !panelEl.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !panelEl.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    void refreshUnread();
    const tmr = setInterval(() => void refreshUnread(), 60_000);
    const onFocus = () => void refreshUnread();
    window.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKeydown);
    return () => {
      clearInterval(tmr);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeydown);
    };
  });

  $effect(() => {
    if (!chrome.notificationsOpen) return;

    previouslyFocused =
      (document.getElementById('chrome-notifications-trigger') as HTMLElement | null) ??
      (document.activeElement as HTMLElement | null);

    void loadItems();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    void tick().then(() => {
      const focusables = getFocusable(panelEl);
      (focusables[0] ?? panelEl)?.focus();
    });

    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
      previouslyFocused = null;
    };
  });
</script>

{#if chrome.notificationsOpen}
  <!-- tabindex=-1 keeps dimmer out of the Tab cycle; trap stays in the panel -->
  <button
    type="button"
    tabindex="-1"
    class="fixed inset-0 z-40 cursor-default border-0 bg-[rgba(10,10,10,0.5)] p-0 transition-opacity duration-200"
    aria-label={t('closeNotifications')}
    onclick={closeNotifications}
  ></button>

  <div
    bind:this={panelEl}
    class="fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-bg shadow-[rgba(0,0,0,0.12)_0_24px_48px_-12px]"
    role="dialog"
    aria-modal="true"
    aria-label={t('notifications')}
    tabindex="-1"
  >
    <div class="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
      <h2 class="min-w-0 flex-1 truncate text-sm font-medium">{t('notifications')}</h2>
      {#if unreadCount > 0}
        <Button variant="ghost" class="!px-2 !py-1 text-sm" onclick={markAllRead}>
          {t('markAllRead')}
        </Button>
      {/if}
      <button
        type="button"
        class="inline-flex size-9 shrink-0 items-center justify-center rounded-[6px] text-text hover:bg-surface"
        aria-label={t('closeNotifications')}
        onclick={closeNotifications}
      >
        <X size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      {#if items.length === 0}
        <EmptyState title={t('noNotifications')} />
      {:else}
        <ul class="space-y-2">
          {#each items as n (n.id)}
            {@const href = taskHref(n)}
            <li>
              {#if href}
                <button
                  type="button"
                  class="block w-full cursor-pointer rounded-[8px] text-left"
                  onclick={() => void openNotification(n)}
                >
                  <Card class={n.read_at ? 'opacity-60' : ''}>
                    <p class="font-medium">{n.title}</p>
                    {#if n.body}
                      <p class="mt-1 text-sm text-text-muted">{n.body}</p>
                    {/if}
                  </Card>
                </button>
              {:else}
                <Card class={n.read_at ? 'opacity-60' : ''}>
                  <p class="font-medium">{n.title}</p>
                  {#if n.body}
                    <p class="mt-1 text-sm text-text-muted">{n.body}</p>
                  {/if}
                  {#if !n.read_at}
                    <Button variant="ghost" class="mt-2 !px-0" onclick={() => markRead(n.id)}>
                      {t('markRead')}
                    </Button>
                  {/if}
                </Card>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}
