<script lang="ts">
  import type { HTMLSelectAttributes } from 'svelte/elements';

  type Option = { value: string; label: string };

  let {
    value = $bindable(''),
    options = [],
    class: className = '',
    id,
    placeholder,
    ...rest
  }: HTMLSelectAttributes & {
    value?: string;
    options?: Option[];
    class?: string;
    placeholder?: string;
  } = $props();
</script>

<select
  bind:value
  {id}
  class="w-full rounded-[8px] border border-border bg-bg px-3.5 py-2.5 text-[15px] text-text focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-faint {className}"
  {...rest}
>
  {#if placeholder && !value}
    <option value="" disabled>{placeholder}</option>
  {/if}
  {#each options as option (option.value)}
    <option value={option.value}>{option.label}</option>
  {/each}
</select>
