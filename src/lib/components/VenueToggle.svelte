<script lang="ts">
	import { getVenuePreference, setVenuePreference } from '$lib/solver/venue';
	import type { VenuePreference } from '$lib/domain/types';
	import { t } from '$lib/i18n';
	import { onMount } from 'svelte';

	let pref = $state<VenuePreference>('auto');

	onMount(() => {
		pref = getVenuePreference();
	});

	function choose(next: VenuePreference) {
		pref = next;
		setVenuePreference(next);
	}
</script>

<div class="flex items-center gap-2 text-xs" title={t('venueLabel')}>
	<span class="text-text-soft">{t('venueLabel')}:</span>
	<button
		type="button"
		class="rounded-[6px] px-2 py-1 {pref === 'cloud' || pref === 'auto'
			? 'bg-brand-soft text-brand'
			: 'hover:bg-surface'}"
		onclick={() => choose('cloud')}
	>
		{t('venueCloud')}
	</button>
	<button
		type="button"
		class="rounded-[6px] px-2 py-1 {pref === 'local' ? 'bg-brand-soft text-brand' : 'hover:bg-surface'}"
		onclick={() => choose('local')}
	>
		{t('venueLocal')}
	</button>
</div>
