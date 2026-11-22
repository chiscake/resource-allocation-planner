<script lang="ts">
  import { ANGLES4_KEYS, type Angles4 } from './math';
  import { t } from '$lib/i18n';

  let {
    angles4 = $bindable(),
    onChange,
  }: {
    angles4: Angles4;
    /** Called after a slider edit (e.g. stop auto-rotate). */
    onChange?: () => void;
  } = $props();

  const PI = Math.PI;
  const LABELS: Record<keyof Angles4, string> = {
    xy: 'XY',
    xz: 'XZ',
    yz: 'YZ',
    xw: 'XW',
    yw: 'YW',
    zw: 'ZW',
  };

  function setKey(key: keyof Angles4, value: number) {
    angles4 = { ...angles4, [key]: value };
    onChange?.();
  }
</script>

<div class="col-span-full">
  <p class="mb-1.5 text-xs font-medium text-text-muted">{t('vizAngles4')}</p>
  <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {#each ANGLES4_KEYS as key (key)}
      <label class="text-xs text-text-muted">
        <span class="mb-1 flex items-center justify-between gap-2">
          <span>{LABELS[key]}</span>
          <span class="font-mono tabular-nums text-text">{angles4[key].toFixed(2)}</span>
        </span>
        <input
          type="range"
          class="w-full accent-brand"
          min={-PI}
          max={PI}
          step="0.01"
          value={angles4[key]}
          oninput={(e) => setKey(key, Number(e.currentTarget.value))}
        />
      </label>
    {/each}
  </div>
</div>
