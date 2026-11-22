<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/db/supabase';
  import { t } from '$lib/i18n';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';

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

  let items = $state<N[]>([]);

  function taskHref(n: N): string | null {
    if (n.entity_type === 'solve_node' && n.entity_id) {
      return `/app/task/${n.entity_id}`;
    }
    return null;
  }

  async function load() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    items = (data ?? []) as N[];
  }

  onMount(() => {
    void load();
    const tmr = setInterval(() => void load(), 60_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(tmr);
      window.removeEventListener('focus', onFocus);
    };
  });

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    await load();
  }

  async function openNotification(n: N) {
    if (!n.read_at) {
      await markRead(n.id);
    }
    const href = taskHref(n);
    if (href) await goto(href);
  }
</script>

<section class="mx-auto max-w-2xl space-y-6">
  <PageHeader title={t('notifications')} description={t('notificationsHint')} />

  {#if items.length === 0}
    <EmptyState title={t('notificationsEmpty')} />
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
                {#if n.body}<p class="mt-1 text-sm text-text-muted">{n.body}</p>{/if}
              </Card>
            </button>
          {:else}
            <Card class={n.read_at ? 'opacity-60' : ''}>
              <p class="font-medium">{n.title}</p>
              {#if n.body}<p class="mt-1 text-sm text-text-muted">{n.body}</p>{/if}
              {#if !n.read_at}
                <Button variant="ghost" class="mt-2 px-0!" onclick={() => markRead(n.id)}>
                  {t('markRead')}
                </Button>
              {/if}
            </Card>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
