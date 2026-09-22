<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import type { User } from '@supabase/supabase-js';
	import { supabase } from '$lib/db/supabase';
	import AppHeader from '$lib/components/chrome/AppHeader.svelte';
	import AppSidebar from '$lib/components/chrome/AppSidebar.svelte';
	import NotificationsDrawer from '$lib/components/chrome/NotificationsDrawer.svelte';
	import { t } from '$lib/i18n';
	import { chrome, initChromeNav, closeMobileNav } from '$lib/chrome/chrome.svelte';

	let { children } = $props();
	let userEmail = $state('');
	let isAdmin = $state(false);
	let signedIn = $state(false);

	function applyUser(user: User | null) {
		signedIn = !!user;
		userEmail = user?.email ?? '';
		isAdmin = user?.app_metadata?.role === 'admin';
	}

	async function loadAuth() {
		const { data } = await supabase.auth.getSession();
		applyUser(data.session?.user ?? null);
	}

	async function logout() {
		await supabase.auth.signOut();
		location.href = '/login';
	}

	onMount(() => {
		initChromeNav();
		void loadAuth();
		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((_event, session) => {
			applyUser(session?.user ?? null);
		});
		return () => subscription.unsubscribe();
	});

	afterNavigate(() => {
		closeMobileNav();
	});
</script>

<div class="flex h-dvh flex-col overflow-hidden bg-bg">
	<AppHeader {userEmail} onLogout={logout} />
	<div class="relative flex min-h-0 flex-1 overflow-hidden">
		<AppSidebar {isAdmin} {signedIn} />

		{#if chrome.mobileNavOpen}
			<button
				type="button"
				class="absolute inset-0 z-20 cursor-default border-0 bg-[rgba(10,10,10,0.35)] p-0 md:hidden"
				aria-label={t('closeNav')}
				onclick={closeMobileNav}
			></button>
		{/if}

		<main class="min-w-0 flex-1 overflow-y-auto p-6">
			{@render children()}
		</main>
	</div>
	<NotificationsDrawer />
</div>
