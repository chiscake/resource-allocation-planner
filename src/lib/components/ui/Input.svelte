<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  let {
    value = $bindable(''),
    class: className = '',
    id,
    ...rest
  }: HTMLInputAttributes & {
    value?: string;
    class?: string;
  } = $props();
</script>

<input
  bind:value
  {id}
  class="w-full rounded-[8px] border border-border bg-bg px-3.5 py-2.5 text-[15px] text-text placeholder:text-text-faint focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-faint {className}"
  {...rest}
/>
