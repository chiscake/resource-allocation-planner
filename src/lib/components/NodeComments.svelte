<script lang="ts">
  import { supabase } from '$lib/db/supabase';
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';

  export type CommentRow = {
    id: string;
    body: string;
    author_id: string;
    created_at: string;
    updated_at?: string;
    author_name: string;
  };

  /** Raw rows from get_shared_node (display_name may be null). */
  export type PublicCommentRow = {
    id: string;
    body: string;
    author_id: string;
    created_at: string;
    display_name?: string | null;
  };

  let {
    nodeId = '',
    isNodeOwner = false,
    readOnly = false,
    shareToken = '',
    initialComments = null,
    class: className = '',
  }: {
    nodeId?: string;
    isNodeOwner?: boolean;
    /** Hide compose (e.g. guest on public share). */
    readOnly?: boolean;
    /** Public share: load/post/delete via token RPCs (no direct table access). */
    shareToken?: string;
    /** Seed rows before first RPC reload (optional). */
    initialComments?: PublicCommentRow[] | null;
    class?: string;
  } = $props();

  let comments = $state<CommentRow[]>([]);
  let draft = $state('');
  let busy = $state(false);
  let error = $state('');
  let userId = $state<string | null>(null);
  let seeded = $state(false);

  function mapPublic(rows: PublicCommentRow[]): CommentRow[] {
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      author_id: r.author_id,
      created_at: r.created_at,
      author_name:
        typeof r.display_name === 'string' && r.display_name.trim()
          ? r.display_name.trim()
          : t('commentsAuthorFallback'),
    }));
  }

  async function loadFromShareToken() {
    const { data: auth } = await supabase.auth.getUser();
    userId = auth.user?.id ?? null;
    const { data, error: qErr } = await supabase.rpc('get_shared_node', {
      p_token: shareToken,
    });
    if (qErr || !data?.length) {
      error = qErr?.message ?? t('shareUnavailable');
      return;
    }
    const row = data[0] as { comments?: PublicCommentRow[] | null };
    comments = mapPublic(Array.isArray(row.comments) ? row.comments : []);
  }

  async function load() {
    error = '';
    if (shareToken) {
      if (!seeded && initialComments != null) {
        comments = mapPublic(initialComments);
        seeded = true;
        const { data: auth } = await supabase.auth.getUser();
        userId = auth.user?.id ?? null;
        return;
      }
      await loadFromShareToken();
      return;
    }
    if (initialComments != null) {
      comments = mapPublic(initialComments);
      userId = null;
      return;
    }
    if (!nodeId) {
      comments = [];
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    userId = auth.user?.id ?? null;
    const { data, error: qErr } = await supabase
      .from('node_comments')
      .select('id, body, author_id, created_at, updated_at')
      .eq('node_id', nodeId)
      .order('created_at', { ascending: true });
    if (qErr) {
      error = qErr.message;
      comments = [];
      return;
    }
    const rows = (data ?? []) as Omit<CommentRow, 'author_name'>[];
    const authorIds = [...new Set(rows.map((r) => r.author_id))];
    const nameById = new Map<string, string>();
    if (authorIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', authorIds);
      for (const p of profiles ?? []) {
        const name = typeof p.display_name === 'string' ? p.display_name.trim() : '';
        nameById.set(p.id, name || t('commentsAuthorFallback'));
      }
    }
    comments = rows.map((r) => ({
      ...r,
      author_name: nameById.get(r.author_id) ?? t('commentsAuthorFallback'),
    }));
  }

  $effect(() => {
    void nodeId;
    void shareToken;
    void initialComments;
    void load();
  });

  async function submit() {
    if (readOnly) return;
    const body = draft.trim();
    if (!body || busy) return;
    busy = true;
    error = '';
    try {
      if (shareToken) {
        const { error: rpcErr } = await supabase.rpc('add_comment_by_share_token', {
          p_token: shareToken,
          p_body: body,
        });
        if (rpcErr) {
          error = rpcErr.message.includes('not authenticated') ? t('noSession') : rpcErr.message;
          return;
        }
        draft = '';
        seeded = true;
        await loadFromShareToken();
        return;
      }
      if (!nodeId) return;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        error = t('noSession');
        return;
      }
      const { error: insErr } = await supabase.from('node_comments').insert({
        node_id: nodeId,
        author_id: auth.user.id,
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
    if (readOnly) return;
    busy = true;
    error = '';
    try {
      if (shareToken) {
        const { error: rpcErr } = await supabase.rpc('delete_own_comment_by_share_token', {
          p_token: shareToken,
          p_comment_id: id,
        });
        if (rpcErr) {
          error = rpcErr.message;
          return;
        }
        await loadFromShareToken();
        return;
      }
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

  async function removeAll() {
    if (readOnly || !isNodeOwner || busy || comments.length === 0 || !nodeId || shareToken) return;
    busy = true;
    error = '';
    try {
      const { error: delErr } = await supabase.rpc('delete_node_comments', {
        p_node_id: nodeId,
      });
      if (delErr) {
        error = delErr.message;
        return;
      }
      await load();
    } finally {
      busy = false;
    }
  }

  function canDelete(authorId: string): boolean {
    if (readOnly) return false;
    return userId === authorId || (!shareToken && isNodeOwner);
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
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h3 class="text-sm font-medium text-text">{t('comments')}</h3>
    {#if !readOnly && !shareToken && isNodeOwner && comments.length > 0}
      <Button
        variant="ghost"
        class="px-2! py-0.5! text-xs text-danger-text"
        disabled={busy}
        onclick={() => void removeAll()}
      >
        {t('commentsDeleteAll')}
      </Button>
    {/if}
  </div>

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
            <div class="flex flex-wrap items-baseline gap-2">
              <span class="text-xs font-medium text-text">{c.author_name}</span>
              <time class="text-xs text-text-soft" datetime={c.created_at}>
                {formatWhen(c.created_at)}
              </time>
            </div>
            {#if canDelete(c.author_id)}
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

  {#if readOnly && shareToken}
    <p class="text-sm text-text-muted">
      <a class="text-brand underline-offset-2 hover:underline" href="/login">{t('login')}</a>
      — {t('commentsLoginHint')}
    </p>
  {:else if !readOnly}
    <div class="flex flex-col gap-2">
      <textarea
        bind:value={draft}
        rows="2"
        class="min-h-18 w-full resize-y rounded-[8px] border border-border bg-bg px-3.5 py-2.5 text-[15px] text-text placeholder:text-text-faint focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2"
        placeholder={t('commentsPlaceholder')}
        disabled={busy}
        onkeydown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void submit();
          }
        }}></textarea>
      <div class="flex justify-end">
        <Button disabled={busy || !draft.trim()} onclick={() => void submit()}>
          {t('commentsAdd')}
        </Button>
      </div>
    </div>
  {/if}
</section>
