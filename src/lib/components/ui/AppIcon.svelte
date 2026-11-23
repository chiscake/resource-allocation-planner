<script lang="ts" module>
  let uid = 0;
  /** Matches SVG `rx="112"` on a 512 viewBox. */
  const CORNER = `${(112 / 512) * 100}%`;
</script>

<script lang="ts">
  let {
    size = 28,
    class: className = '',
    title = undefined,
  }: {
    /** Pixel size (width & height). */
    size?: number;
    class?: string;
    /** Accessible label; omit for decorative use. */
    title?: string;
  } = $props();

  const gradId = `app-icon-bg-${++uid}`;
  const labelled = $derived(Boolean(title));
</script>

<span
  class="inline-flex shrink-0 overflow-hidden {className}"
  style="width: {size}px; height: {size}px; border-radius: {CORNER}"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    width={size}
    height={size}
    class="block size-full"
    fill="none"
    role={labelled ? 'img' : undefined}
    aria-hidden={labelled ? undefined : 'true'}
    aria-label={title}
  >
    {#if title}
      <title>{title}</title>
    {/if}
    <defs>
      <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="1" stop-color="#e8eefc" />
      </linearGradient>
    </defs>
    <!-- Slight bleed avoids 1px AA fringe at the clip edge -->
    <rect x="-1" y="-1" width="514" height="514" rx="113" fill="url(#{gradId})" />
    <g transform="rotate(-90 256 256)" stroke-width="62">
      <circle
        cx="256"
        cy="256"
        r="150"
        stroke="#ff6b35"
        stroke-dasharray="268 944"
        stroke-dashoffset="0"
      />
      <circle
        cx="256"
        cy="256"
        r="150"
        stroke="#16a34a"
        stroke-dasharray="212 944"
        stroke-dashoffset="-286"
      />
      <circle
        cx="256"
        cy="256"
        r="150"
        stroke="#f5a300"
        stroke-dasharray="212 944"
        stroke-dashoffset="-516"
      />
      <circle
        cx="256"
        cy="256"
        r="150"
        stroke="#2563eb"
        stroke-dasharray="170 944"
        stroke-dashoffset="-746"
      />
    </g>
    <g stroke="#1e2a4a" stroke-width="22" stroke-linecap="round" stroke-linejoin="round">
      <path d="M196,300 L240,252 L270,278 L318,214" />
      <path d="M280,212 H320 V252" />
    </g>
  </svg>
</span>
