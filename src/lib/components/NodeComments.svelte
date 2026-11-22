<script lang="ts">
  import { supabase } from '$lib/db/supabase';
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';

  type CommentRow = {
    id: string;
    body: string;
    author_id: string;
    created_at: string;
    updated_at: string;
  };

  let {
    nodeId,
    scope,
    class: className = '',
  }: {
    nodeId: string;
    scope: 'plan' | 'result';
    class?: string;
  } = $props();

  let comments = $state<CommentRow[]>([]);
  let draft = $state('');
  let busy = $state(false);
  let error = $state('');
  let userId = $state<string | null>(null);

  const heading = $derived(scope === 'plan' ? t('commentsPlan') : t('commentsResult'));

  async function load() {
    error = '';
    const { data: auth } = await supabase.auth.getUser();
    userId = auth.user?.id ?? null;
    const { data, error: qErr } = await supabase
      .from('node_comments')
      .select('id, body, author_id, created_at, updated_at')
      .eq('node_id', nodeId)
      .eq('scope', scope)
      .order('created_at', { ascending: true });
    if (qErr) {
      error = qErr.message;
      comments = [];
      return;
    }
    comments = (data ?? []) as CommentRow[];
  }

  $effect(() => {
    void nodeId;
    void scope;
    void load();
  });

  async function submit() {
    const body = draft.trim();
    if (!body || busy) return;
    busy = true;
    error = '';
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        error = t('noSession');
        return;
      }
      const { error: insErr } = await supabase.from('node_comments').insert({
        node_id: nodeId,
        author_id: auth.user.id,
        scope,
        body,
      });
      if (insErr) {
        error = insErr.message;
        return;
      }
      draft = '';
      await load();
    } finally {
      busy = false;
    }
  }

  async function remove(id: string) {
    busy = true;
    error = '';
    try {
      const { error: delErr } = await supabase.from('node_comments').delete().eq('id', id);
      if (delErr) {
        error = delErr.message;
        return;
      }
      await load();
    } finally {
      busy = false;
    }
  }

  function formatWhen(iso: string): string {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<section class="flex flex-col gap-3 {className}">
  <h3 class="text-sm font-medium text-text">{heading}</h3>

  {#if error}
    <p class="text-sm text-danger-text">{error}</p>
  {/if}

  {#if comments.length === 0}
    <p class="text-sm text-text-muted">{t('commentsEmpty')}</p>
  {:else}
    <ul class="flex flex-col gap-3">
      {#each comments as c (c.id)}
        <li class="rounded-[8px] border border-border-soft bg-bg-soft px-3 py-2">
          <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
            <time class="text-xs text-text-soft" datetime={c.created_at}>
              {formatWhen(c.created_at)}
            </time>
            {#if userId === c.author_id}
              <Button
                variant="ghost"
                class="px-2! py-0.5! text-xs text-danger-text"
                disabled={busy}
                onclick={() => remove(c.id)}
              >
                {t('commentsDelete')}
              </Button>
            {/if}
          </div>
          <p class="whitespace-pre-wrap text-sm text-text">{c.body}</p>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
    <textarea
      bind:value={draft}
      rows="2"
      class="min-h-[4.5rem] w-full flex-1 resize-y rounded-[8px] border border-border bg-bg px-3.5 py-2.5 text-[15px] text-text placeholder:text-text-faint focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2"
      placeholder={t('commentsPlaceholder')}
      disabled={busy}
      onkeydown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void submit();
        }
      }}></textarea>
    <Button disabled={busy || !draft.trim()} onclick={() => void submit()}>
      {t('commentsAdd')}
    </Button>
  </div>
</section>
