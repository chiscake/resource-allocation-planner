<script lang="ts">
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import InlineAlert from '$lib/components/ui/InlineAlert.svelte';
  import { copyToClipboard } from '$lib/ui/clipboard';

  export type ShareGrantRow = {
    id: string;
    grantee_id: string;
    label: string;
  };

  let {
    shareUrl = '',
    grants = [],
    busy = false,
    grantValue = $bindable(''),
    message = '',
    showOrgWarning = false,
    lockedHint = '',
    onCreateLink,
    onRevokeLink,
    onCancelSharing,
    onGrant,
    onRevokeGrant,
  }: {
    shareUrl?: string;
    grants?: ShareGrantRow[];
    busy?: boolean;
    grantValue?: string;
    message?: string;
    showOrgWarning?: boolean;
    lockedHint?: string;
    onCreateLink: () => void;
    onRevokeLink: () => void;
    onCancelSharing: () => void;
    onGrant: () => void;
    onRevokeGrant: (grantId: string) => void;
  } = $props();

  const hasActiveShare = $derived(Boolean(shareUrl) || grants.length > 0);
</script>

<Card>
  <h2 class="mb-3 text-lg font-medium">{t('share')}</h2>
  <InlineAlert tone="muted" class="mb-3">{t('shareLockHint')}</InlineAlert>
  {#if showOrgWarning}
    <InlineAlert tone="warning" class="mb-3">{t('shareOrgWarning')}</InlineAlert>
  {/if}
  {#if lockedHint}
    <InlineAlert tone="muted" class="mb-3">{lockedHint}</InlineAlert>
  {/if}

  <section class="mb-4">
    <h3 class="mb-2 text-sm font-medium text-text">{t('sharePublicLink')}</h3>
    {#if shareUrl}
      <p class="mb-2 break-all font-mono text-xs">{shareUrl}</p>
      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" onclick={() => void copyToClipboard(shareUrl)}>
          {t('shareCopyLink')}
        </Button>
        <Button variant="secondary" onclick={onRevokeLink}>{t('revokeShareLink')}</Button>
      </div>
    {:else}
      <Button variant="secondary" onclick={onCreateLink}>{t('createShareLink')}</Button>
    {/if}
  </section>

  <section class="mb-4">
    <h3 class="mb-2 text-sm font-medium text-text">{t('sharePeople')}</h3>
    {#if grants.length > 0}
      <ul class="mb-3 flex flex-col gap-2">
        {#each grants as g (g.id)}
          <li
            class="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-border-soft bg-bg-soft px-3 py-2"
          >
            <span class="text-sm text-text">{g.label}</span>
            <Button
              variant="ghost"
              class="px-2! py-0.5! text-xs text-danger-text"
              disabled={busy}
              onclick={() => onRevokeGrant(g.id)}
            >
              {t('grantRevokeOne')}
            </Button>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="flex flex-wrap gap-2">
      <Input class="min-w-48 flex-1" placeholder={t('grantPlaceholder')} bind:value={grantValue} />
      <Button variant="secondary" onclick={onGrant}>{t('openAccess')}</Button>
    </div>
    <p class="mt-2 text-xs text-text-muted">{t('grantHint')}</p>
  </section>

  {#if hasActiveShare}
    <Button variant="secondary" disabled={busy} onclick={onCancelSharing}>
      {t('cancelSharing')}
    </Button>
  {/if}
  {#if message}
    <p class="mt-2 text-sm text-text-muted">{message}</p>
  {/if}
</Card>
