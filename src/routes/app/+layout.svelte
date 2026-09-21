<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import VenueToggle from '$lib/components/VenueToggle.svelte';
	import { isTauri } from '$lib/platform';
	import { supabase } from '$lib/db/supabase';

	let { children } = $props();
	let unread = $state(0);

	async function loadUnread() {
		const { count } = await supabase
			.from('notifications')
			.select('*', { count: 'exact', head: true })
			.is('read_at', null);
		unread = count ?? 0;
	}

	onMount(() => {
		void loadUnread();
		const tmr = setInterval(() => void loadUnread(), 60_000);
		const onFocus = () => void loadUnread();
		window.addEventListener('focus', onFocus);
		return () => {
			clearInterval(tmr);
			window.removeEventListener('focus', onFocus);
		};
	});
</script>

<div class="flex min-h-screen flex-col">
	<header class="flex items-center justify-between border-b border-border px-6 py-3">
		<a href="/app" class="text-sm font-medium text-text">{t('appTitle')}</a>
		<nav class="flex items-center gap-4 text-sm text-text-muted">
			<a href="/app" class="hover:text-text">{t('home')}</a>
			<a href="/login" class="hover:text-text">{t('login')}</a>
			<a href="/app/notifications" class="hover:text-text">
				{t('notifications')}{#if unread > 0}
					<span class="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">{unread}</span>
				{/if}
			</a>
			{#if isTauri()}
				<VenueToggle />
			{/if}
		</nav>
	</header>
	<div class="flex-1 p-6">{@render children()}</div>
</div>
