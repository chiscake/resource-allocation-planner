<script lang="ts">
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import InlineAlert from '$lib/components/ui/InlineAlert.svelte';

  let {
    shareUrl = '',
    hasActiveShare = false,
    busy = false,
    grantValue = $bindable(''),
    message = '',
    showOrgWarning = false,
    onCreateLink,
    onRevokeLink,
    onCancelSharing,
    onGrant,
  }: {
    shareUrl?: string;
    hasActiveShare?: boolean;
    busy?: boolean;
    grantValue?: string;
    message?: string;
    showOrgWarning?: boolean;
    onCreateLink: () => void;
    onRevokeLink: () => void;
    onCancelSharing: () => void;
    onGrant: () => void;
  } = $props();
</script>

<Card>
  <h2 class="mb-3 text-lg font-medium">{t('share')}</h2>
  {#if showOrgWarning}
    <InlineAlert tone="warning" class="mb-3">{t('shareOrgWarning')}</InlineAlert>
  {/if}
  {#if shareUrl}
    <p class="mb-2 break-all font-mono text-xs">{shareUrl}</p>
    <Button variant="secondary" onclick={onRevokeLink}>{t('revokeShareLink')}</Button>
  {:else}
    <Button variant="secondary" onclick={onCreateLink}>{t('createShareLink')}</Button>
  {/if}
  {#if hasActiveShare}
    <div class="mt-2">
      <Button variant="secondary" disabled={busy} onclick={onCancelSharing}>
        {t('cancelSharing')}
      </Button>
    </div>
  {/if}
  <div class="mt-4 flex flex-wrap gap-2">
    <Input class="min-w-48 flex-1" placeholder={t('grantPlaceholder')} bind:value={grantValue} />
    <Button variant="secondary" onclick={onGrant}>{t('grantAccess')}</Button>
  </div>
  <p class="mt-2 text-xs text-text-muted">{t('grantHint')}</p>
  {#if message}
    <p class="mt-2 text-sm text-text-muted">{message}</p>
  {/if}
</Card>
