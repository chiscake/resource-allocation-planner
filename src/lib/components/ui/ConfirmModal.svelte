<script lang="ts">
  import { t } from '$lib/i18n';
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';

  let {
    open = $bindable(false),
    title,
    body = '',
    confirmLabel,
    cancelLabel = t('cancel'),
    confirmVariant = 'danger',
    busy = false,
    onconfirm,
    oncancel,
  }: {
    open?: boolean;
    title: string;
    body?: string;
    confirmLabel: string;
    cancelLabel?: string;
    confirmVariant?: 'danger' | 'primary' | 'secondary';
    busy?: boolean;
    onconfirm: () => void | Promise<void>;
    oncancel?: () => void;
  } = $props();

  const bodyId = $props.id();
  let running = $state(false);

  const isBusy = $derived(busy || running);

  async function confirm() {
    if (isBusy) return;
    running = true;
    try {
      await onconfirm();
      open = false;
    } finally {
      running = false;
    }
  }

  function cancel() {
    if (isBusy) return;
    open = false;
    oncancel?.();
  }
</script>

<Modal
  bind:open
  {title}
  describedBy={body ? bodyId : undefined}
  dismissible={!isBusy}
  onclose={() => {
    oncancel?.();
  }}
>
  {#if body}
    <p id={bodyId} class="text-sm break-words text-text-muted">{body}</p>
  {/if}
  <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
    <Button variant="ghost" class="w-full sm:w-auto" disabled={isBusy} onclick={cancel}>
      {cancelLabel}
    </Button>
    <Button
      variant={confirmVariant}
      class="w-full sm:w-auto"
      disabled={isBusy}
      onclick={() => void confirm()}
    >
      {confirmLabel}
    </Button>
  </div>
</Modal>
