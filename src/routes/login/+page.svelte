<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { supabase } from '$lib/db/supabase';
	import { clearGuest, loadGuest } from '$lib/db/guest';
	import { createBlankModel } from '$lib/domain';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import InlineAlert from '$lib/components/ui/InlineAlert.svelte';

	let email = $state('demo1@example.com');
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
			title: guest.title || t('guestScenarioTitle'),
			kind: 'root',
			model: guest.model ?? createBlankModel(),
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
			error = err?.message ?? t('loginFailed');
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
		<InlineAlert tone="muted">{t('guestUpload')}</InlineAlert>
	{/if}
	{#if error}
		<InlineAlert>{error}</InlineAlert>
	{/if}
	<form class="flex flex-col gap-3" onsubmit={onSubmit}>
		<label class="flex flex-col gap-1 text-sm">
			<span>{t('email')}</span>
			<Input bind:value={email} type="email" autocomplete="username" />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			<span>{t('password')}</span>
			<Input bind:value={password} type="password" autocomplete="current-password" />
		</label>
		<Button type="submit" disabled={busy}>{t('login')}</Button>
	</form>
	<Button variant="ghost" type="button" disabled class="!justify-start !px-0 !text-text-faint">
		{t('registerDisabled')}
	</Button>
</main>
