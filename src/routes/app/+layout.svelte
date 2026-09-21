<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import VenueToggle from '$lib/components/VenueToggle.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { isTauri } from '$lib/platform';
	import { supabase } from '$lib/db/supabase';

	let { children } = $props();
	let unread = $state(0);
	let userEmail = $state('');
	let isAdmin = $state(false);

	async function loadAuth() {
		const { data } = await supabase.auth.getUser();
		userEmail = data.user?.email ?? '';
		isAdmin = data.user?.app_metadata?.role === 'admin';
	}

	async function loadUnread() {
		const { count } = await supabase
			.from('notifications')
			.select('*', { count: 'exact', head: true })
			.is('read_at', null);
		unread = count ?? 0;
	}

	async function logout() {
		await supabase.auth.signOut();
		location.href = '/login';
	}

	onMount(() => {
		void loadAuth();
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
	<header class="flex h-14 items-center justify-between border-b border-border px-6">
		<a href="/app" class="text-sm font-medium text-text">{t('appTitle')}</a>
		<nav class="flex items-center gap-1 text-sm">
			<Button variant="ghost" href="/app">{t('home')}</Button>
			{#if !userEmail}
				<Button variant="ghost" href="/login">{t('login')}</Button>
			{/if}
			<Button variant="ghost" href="/app/notifications">
				{t('notifications')}{#if unread > 0}
					<span class="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">{unread}</span>
				{/if}
			</Button>
			{#if isAdmin}
				<Button variant="ghost" href="/app/admin">{t('admin')}</Button>
			{/if}
			{#if isTauri()}
				<VenueToggle />
			{/if}
			{#if userEmail}
				<span class="hidden px-2 text-text-muted sm:inline">{userEmail}</span>
				<Button variant="ghost" onclick={logout}>{t('logout')}</Button>
			{/if}
		</nav>
	</header>
	<div class="flex-1 p-6">{@render children()}</div>
</div>
