<script lang="ts">
  type TabItem = { id: string; label: string };

  let {
    items,
    active = $bindable(''),
    class: className = '',
  }: {
    items: TabItem[];
    active?: string;
    class?: string;
  } = $props();
</script>

<div
  class="inline-flex flex-wrap gap-1 rounded-[8px] border border-border bg-bg p-1 {className}"
  role="tablist"
>
  {#each items as item (item.id)}
    <button
      type="button"
      role="tab"
      aria-selected={active === item.id}
      class="rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 {active ===
      item.id
        ? 'bg-selected-bg text-text'
        : 'text-text-muted hover:bg-surface hover:text-text'}"
      onclick={() => (active = item.id)}
    >
      {item.label}
    </button>
  {/each}
</div>
