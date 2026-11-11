<script lang="ts">
  import Button from "$lib/components/ui/Button.svelte";

  let {
    index = $bindable(0),
    maxIndex = 0,
    label = "",
    playing = $bindable(false),
    speedMs = 700,
  }: {
    index?: number;
    maxIndex?: number;
    label?: string;
    playing?: boolean;
    speedMs?: number;
  } = $props();

  $effect(() => {
    if (!playing) return;
    if (index >= maxIndex) {
      playing = false;
      return;
    }
    const t = setTimeout(() => {
      index = Math.min(maxIndex, index + 1);
    }, speedMs);
    return () => clearTimeout(t);
  });
</script>

<div class="flex flex-col gap-2">
  <div class="flex flex-wrap items-center gap-2">
    <Button
      variant="ghost"
      class="!px-2 !py-1"
      disabled={index <= 0}
      onclick={() => {
        playing = false;
        index = Math.max(0, index - 1);
      }}>‹</Button
    >
    <Button
      variant="secondary"
      class="!px-3 !py-1"
      disabled={maxIndex <= 0 || index >= maxIndex}
      onclick={() => (playing = !playing)}>{playing ? "❚❚" : "▶"}</Button
    >
    <Button
      variant="ghost"
      class="!px-2 !py-1"
      disabled={index >= maxIndex}
      onclick={() => {
        playing = false;
        index = Math.min(maxIndex, index + 1);
      }}>›</Button
    >
    <Button
      variant="ghost"
      class="!px-2 !py-1"
      onclick={() => {
        playing = false;
        index = 0;
      }}>↺</Button
    >
    <span class="font-mono text-xs text-text-muted"
      >{label || `${index} / ${maxIndex}`}</span
    >
  </div>
  <input
    type="range"
    class="w-full accent-brand"
    min="0"
    max={maxIndex}
    bind:value={index}
    disabled={maxIndex <= 0}
  />
</div>
