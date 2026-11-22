<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/db/supabase';
  import { moderateTemplatePublish } from '$lib/db/template-publish';
  import type { Model } from '$lib/domain';
  import { t } from '$lib/i18n';
  import TemplatePreviewCard from '$lib/components/TemplatePreviewCard.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import InlineAlert from '$lib/components/ui/InlineAlert.svelte';

  type Row = {
    id: string;
    title: string;
    model: Model | null;
    owner_id: string | null;
  };

  let rows = $state<Row[]>([]);
  let allowed = $state(false);
  let busyId = $state<string | null>(null);
  let msg = $state('');
  let okMsg = $state('');

  async function reload() {
    const { data, error } = await supabase
      .from('templates')
      .select('id, title, model, owner_id')
      .eq('publish_status', 'pending')
      .is('deleted_at', null)
      .is('system_kind', null)
      .order('updated_at', { ascending: false });
    if (error) {
      msg = error.message;
      rows = [];
      return;
    }
    rows = (data ?? []) as Row[];
  }

  onMount(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const role = auth.user?.app_metadata?.role;
    allowed = role === 'admin' || role === 'mod';
    if (!allowed) {
      void goto('/app');
      return;
    }
    await reload();
  });

  async function onModerate(id: string, action: 'approve' | 'reject') {
    if (busyId) return;
    busyId = id;
    msg = '';
    okMsg = '';
    const res = await moderateTemplatePublish(id, action);
    if (res.error) msg = res.error;
    else {
      okMsg = action === 'approve' ? t('publishApproveDone') : t('publishRejectDone');
      await reload();
    }
    busyId = null;
  }
</script>

<section class="mx-auto flex max-w-5xl flex-col gap-6">
  <PageHeader title={t('moderation')} description={t('moderationHint')} />

  {#if msg}
    <InlineAlert>{msg}</InlineAlert>
  {/if}
  {#if okMsg}
    <p class="text-sm text-text-muted">{okMsg}</p>
  {/if}

  {#if !allowed}
    <p class="text-sm text-text-muted">{t('loading')}</p>
  {:else if rows.length === 0}
    <EmptyState title={t('moderationEmpty')} description={t('moderationEmptyHint')} />
  {:else}
    <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each rows as r (r.id)}
        <li>
          <TemplatePreviewCard
            title={r.title}
            model={r.model}
            subtitle={t('publishStatusPending')}
            href="/app/templates/{r.id}"
          >
            {#snippet actions()}
              <Button variant="secondary" class="px-3! py-1.5!" href="/app/templates/{r.id}">
                {t('viewTemplate')}
              </Button>
              <Button
                variant="primary"
                class="px-3! py-1.5!"
                disabled={busyId === r.id}
                onclick={() => onModerate(r.id, 'approve')}
              >
                {t('publishApprove')}
              </Button>
              <Button
                variant="secondary"
                class="px-3! py-1.5!"
                disabled={busyId === r.id}
                onclick={() => onModerate(r.id, 'reject')}
              >
                {t('publishReject')}
              </Button>
            {/snippet}
          </TemplatePreviewCard>
        </li>
      {/each}
    </ul>
  {/if}
</section>
