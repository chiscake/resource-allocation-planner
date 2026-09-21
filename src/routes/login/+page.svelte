<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { supabase } from '$lib/db/supabase';
	import { clearGuest, loadGuest } from '$lib/db/guest';
	import { createTask13Model } from '$lib/domain';

	let email = $state('demo1@rap.local');
	let password = $state('password123');
	let error = $state('');
	let busy = $state(false);
	let hasGuest = $state(false);

	onMount(() => {
		hasGuest = loadGuest() != null;
	});

	async function uploadGuestIfAny(userId: string) {
		const guest = loadGuest();
		if (!guest) return;
		await supabase.from('solve_nodes').insert({
			owner_id: userId,
			title: guest.title || 'Гостевой сценарий',
			kind: 'root',
			model: guest.model ?? createTask13Model(),
			result: guest.result ?? null
		});
		clearGuest();
	}

	async function onSubmit(e: Event) {
		e.preventDefault();
		busy = true;
		error = '';
		const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
		if (err || !data.user) {
			error = err?.message ?? 'Ошибка входа';
			busy = false;
			return;
		}
		await uploadGuestIfAny(data.user.id);
		busy = false;
		void goto('/app');
	}
</script>

<main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
	<h1 class="text-2xl font-medium">{t('login')}</h1>
	<p class="text-sm text-text-muted">{t('registerDisabled')}</p>
	{#if hasGuest}
		<p class="rounded-[8px] bg-surface px-3 py-2 text-sm text-text-muted">{t('guestUpload')}</p>
	{/if}
	{#if error}
		<p class="rounded-[8px] bg-danger-bg px-3 py-2 text-sm text-danger-text">{error}</p>
	{/if}
	<form class="flex flex-col gap-3" onsubmit={onSubmit}>
		<label class="flex flex-col gap-1 text-sm">
			<span>{t('email')}</span>
			<input
				bind:value={email}
				type="email"
				class="rounded-[8px] border border-border px-3 py-2"
				autocomplete="username"
			/>
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span>{t('password')}</span>
			<input
				bind:value={password}
				type="password"
				class="rounded-[8px] border border-border px-3 py-2"
				autocomplete="current-password"
			/>
		</label>
		<button
			type="submit"
			disabled={busy}
			class="rounded-[8px] bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-text-medium disabled:opacity-50"
		>
			{t('login')}
		</button>
	</form>
	<button type="button" disabled class="text-sm text-text-faint">{t('registerDisabled')}</button>
</main>
