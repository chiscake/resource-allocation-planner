<script lang="ts">
  import { untrack } from 'svelte';
  import type { Model } from '$lib/domain';
  import { modelThumbCells } from './lp-tableau';

  let {
    model,
    class: className = '',
  }: {
    model: Model | null | undefined;
    class?: string;
  } = $props();

  const thumb = $derived(model ? modelThumbCells(model) : { cells: [['—']], truncated: false });

  const cols = $derived(thumb.cells[0]?.length ?? 1);

  let frameEl: HTMLDivElement | undefined = $state();
  let contentEl: HTMLDivElement | undefined = $state();
  let scale = $state(1);
  let naturalW = $state(0);
  let naturalH = $state(0);

  /**
   * object-fit: contain — scale uniformly to fit width OR height
   * (whichever binds first). May grow above 1 so small matrices fill the frame.
   */
  function updateScale(): void {
    const frame = frameEl;
    const content = contentEl;
    if (!frame || !content) return;

    const pad = 8; // matches .matrix-thumb-fit padding (0.5rem)
    const fw = Math.max(0, frame.clientWidth - pad * 2);
    const fh = Math.max(0, frame.clientHeight - pad * 2);
    if (fw <= 0 || fh <= 0) return;

    const cw = content.offsetWidth;
    const ch = content.offsetHeight;
    if (cw <= 0 || ch <= 0) return;

    // 0.99 inset avoids subpixel clipping from transform + overflow:hidden
    const next = Math.min(fw / cw, fh / ch) * 0.99;
    untrack(() => {
      if (naturalW !== cw) naturalW = cw;
      if (naturalH !== ch) naturalH = ch;
      if (Math.abs(next - scale) > 0.001) scale = next;
    });
  }

  $effect(() => {
    void thumb.cells;
    const frame = frameEl;
    const content = contentEl;
    if (!frame || !content) return;

    updateScale();
    const ro = new ResizeObserver(() => updateScale());
    ro.observe(frame);
    ro.observe(content);
    return () => ro.disconnect();
  });
</script>

<div
  bind:this={frameEl}
  class="matrix-thumb overflow-hidden rounded-[8px] border border-border bg-bg-soft {className}"
  aria-hidden="true"
>
  <div class="matrix-thumb-fit">
    <div
      class="matrix-thumb-slot"
      style:width={naturalW > 0 ? `${naturalW * scale}px` : undefined}
      style:height={naturalH > 0 ? `${naturalH * scale}px` : undefined}
    >
      <div bind:this={contentEl} class="matrix-thumb-inner" style:transform="scale({scale})">
        <div class="matrix-thumb-grid" style:--cols={cols}>
          {#each thumb.cells as row, ri (ri)}
            {#each row as cell, ci (`${ri}-${ci}`)}
              <span
                class="matrix-thumb-cell"
                class:matrix-thumb-header={ri === 0 || ci === 0}
                class:matrix-thumb-label={ci === 0}
              >
                {cell}
              </span>
            {/each}
          {/each}
        </div>
      </div>
    </div>
  </div>
  {#if thumb.truncated}
    <span class="matrix-thumb-fade"></span>
  {/if}
</div>

<style>
  .matrix-thumb {
    position: relative;
    aspect-ratio: 16 / 10;
    min-height: 4.5rem;
  }

  .matrix-thumb-fit {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 0.5rem;
  }

  .matrix-thumb-slot {
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
  }

  .matrix-thumb-inner {
    transform-origin: top left;
    width: max-content;
  }

  .matrix-thumb-grid {
    display: grid;
    /* First col = content width (corner label); equal data cols */
    grid-template-columns: max-content repeat(calc(var(--cols) - 1), minmax(1.65rem, max-content));
    gap: 1px;
    width: max-content;
    background: var(--color-border);
  }

  .matrix-thumb-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-width: 1.65rem;
    min-height: 0.9rem;
    padding: 2px 5px;
    background: var(--color-bg);
    font-family: var(--font-mono);
    font-size: 0.55rem;
    line-height: 1.15;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .matrix-thumb-label {
    /* No max-width — clipping + center justify ate «Р»/«я» on both sides */
    justify-content: center;
    padding-inline: 6px;
    min-width: 6.75rem;
  }

  .matrix-thumb-header {
    background: var(--color-brand-faint);
    color: var(--color-text-medium);
    font-weight: 500;
  }

  .matrix-thumb-fade {
    pointer-events: none;
    position: absolute;
    inset: auto 0 0 0;
    height: 35%;
    background: linear-gradient(transparent, var(--color-bg-soft));
  }
</style>
