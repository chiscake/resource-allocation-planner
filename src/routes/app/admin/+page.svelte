<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { env } from '$env/dynamic/public';
	import { t } from '$lib/i18n';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Input from '$lib/components/ui/Input.svelte';

	let isAdmin = $state(false);
	let email = $state('');
	let password = $state('password123');
	let displayName = $state('');
	let msg = $state('');
	let users = $state<{ id: string; display_name: string | null; role: string }[]>([]);
	let templates = $state<{ id: string; title: string; system_kind: string | null }[]>([]);
	let editTitle = $state<Record<string, string>>({});

	async function reload() {
		const { data: tpls } = await supabase
			.from('templates')
			.select('id, title, system_kind')
			.not('system_kind', 'is', null);
		templates = (tpls ?? []) as typeof templates;
		for (const tpl of templates) editTitle[tpl.id] = tpl.title;
		const { data: profiles } = await supabase.from('profiles').select('id, display_name, role');
		users = (profiles ?? []) as typeof users;
	}

	onMount(async () => {
		const { data } = await supabase.auth.getUser();
		isAdmin = data.user?.app_metadata?.role === 'admin';
		await reload();
	});

	async function createUser() {
		msg = '';
		const { data: session } = await supabase.auth.getSession();
		const res = await fetch(`${env.PUBLIC_SUPABASE_URL}/functions/v1/admin-create-user`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.session?.access_token}`,
				apikey: env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
			},
			body: JSON.stringify({ email, password, display_name: displayName })
		});
		const body = await res.json();
		msg = res.ok ? `Создан ${body.email}` : body.error ?? 'Ошибка';
		await reload();
	}

	async function saveTemplate(id: string) {
		const title = editTitle[id];
		if (!title) return;
		await supabase
			.from('templates')
			.update({ title, updated_at: new Date().toISOString() })
			.eq('id', id);
		msg = `Шаблон ${id.slice(0, 8)}… обновлён`;
		await reload();
	}
</script>

<section class="mx-auto max-w-2xl space-y-6">
	<PageHeader title={t('admin')} description="Управление пользователями и системными шаблонами." />

	{#if !isAdmin}
		<Card>
			<p class="text-sm text-text-muted">Нужна роль admin (admin@rap.local).</p>
		</Card>
	{:else}
		<Card>
			<h2 class="mb-3 font-medium">Создать пользователя</h2>
			<div class="space-y-3">
				<Input bind:value={email} placeholder="email" type="email" />
				<Input bind:value={displayName} placeholder="Отображаемое имя" />
				<Input bind:value={password} type="password" placeholder="Пароль" />
				<Button onclick={createUser}>Создать</Button>
				{#if msg}<p class="text-sm text-text-muted">{msg}</p>{/if}
			</div>
		</Card>

		<Card>
			<h2 class="mb-3 font-medium">Пользователи</h2>
			<ul class="space-y-1 text-sm">
				{#each users as u}
					<li class="font-mono text-xs">{u.display_name ?? '—'} · {u.role} · {u.id}</li>
				{/each}
			</ul>
		</Card>
	{/if}

	<Card>
		<h2 class="mb-3 font-medium">Системные шаблоны</h2>
		<ul class="space-y-3 text-sm">
			{#each templates as tpl}
				<li class="flex flex-wrap items-center gap-2">
					<span class="text-text-soft">({tpl.system_kind})</span>
					<Input class="min-w-[12rem] flex-1" bind:value={editTitle[tpl.id]} disabled={!isAdmin} />
					{#if isAdmin}
						<Button variant="secondary" class="!px-3 !py-1.5 text-xs" onclick={() => saveTemplate(tpl.id)}>
							Сохранить
						</Button>
					{/if}
				</li>
			{/each}
		</ul>
	</Card>
</section>
