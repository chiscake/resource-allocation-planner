<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { supabase } from '$lib/db/supabase';
  import type { Model, Mutation, SolveResult } from '$lib/domain';
  import { t } from '$lib/i18n';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import SharedTaskViewer from '$lib/components/SharedTaskViewer.svelte';
  import type { PublicCommentRow } from '$lib/components/NodeComments.svelte';

  type ChildRow = {
    id: string;
    title: string;
    kind: string;
    model: Model;
    result: SolveResult | null;
    mutation: Mutation | null;
    what_if_generation: number | null;
    deleted_at: string | null;
  };

  let title = $state('');
  let model = $state<Model | null>(null);
  let result = $state<SolveResult | null>(null);
  let children = $state<ChildRow[]>([]);
  let comments = $state<PublicCommentRow[]>([]);
  let loading = $state(true);
  let error = $state('');
  let signedIn = $state(false);

  const token = $derived(page.params.token ?? '');

  onMount(() => {
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      signedIn = Boolean(sessionData.session?.user);
      const { data, error: e1 } = await supabase.rpc('get_shared_node', { p_token: token });
      loading = false;
      if (e1 || !data?.length) {
        error = t('shareUnavailable');
        return;
      }
      const row = data[0] as {
        title: string;
        model: Model;
        result: SolveResult | null;
        children: ChildRow[] | null;
        comments: PublicCommentRow[] | null;
      };
      title = row.title ?? t('scenarioFallback');
      model = row.model;
      result = row.result;
      children = Array.isArray(row.children) ? row.children : [];
      comments = Array.isArray(row.comments) ? row.comments : [];
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      signedIn = Boolean(session?.user);
    });
    return () => subscription.unsubscribe();
  });
</script>

{#if loading}
  <p class="text-sm text-text-muted">{t('loading')}</p>
{:else if error}
  <div class="grid min-h-[60vh] place-items-center">
    <EmptyState title={error} description={t('shareLinkInvalid')} class="max-w-md" />
  </div>
{:else if model}
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-6">
    <PageHeader {title} description={t('sharePublicView')} />
    <SharedTaskViewer
      title=""
      {model}
      {result}
      {children}
      showFork={false}
      showComments
      commentsReadOnly={!signedIn}
      shareToken={token}
      initialComments={comments}
    />
  </section>
{/if}
