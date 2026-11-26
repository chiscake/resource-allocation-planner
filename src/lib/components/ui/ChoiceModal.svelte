<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';

  let {
    open = $bindable(false),
    title,
    body = '',
    primaryLabel,
    secondaryLabel,
    busy = false,
    onprimary,
    onsecondary,
  }: {
    open?: boolean;
    title: string;
    body?: string;
    primaryLabel: string;
    secondaryLabel: string;
    busy?: boolean;
    onprimary: () => void | Promise<void>;
    onsecondary: () => void | Promise<void>;
  } = $props();

  const bodyId = $props.id();
  let running = $state(false);
  const isBusy = $derived(busy || running);

  async function run(fn: () => void | Promise<void>) {
    if (isBusy) return;
    running = true;
    try {
      await fn();
      open = false;
    } finally {
      running = false;
    }
  }
</script>

<Modal bind:open {title} describedBy={body ? bodyId : undefined} dismissible={!isBusy}>
  {#if body}
    <p id={bodyId} class="text-sm break-words text-text-muted">{body}</p>
  {/if}
  <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
    <Button
      variant="secondary"
      class="w-full sm:w-auto"
      disabled={isBusy}
      onclick={() => void run(onsecondary)}
    >
      {secondaryLabel}
    </Button>
    <Button
      variant="primary"
      class="w-full sm:w-auto"
      disabled={isBusy}
      onclick={() => void run(onprimary)}
    >
      {primaryLabel}
    </Button>
  </div>
</Modal>
