<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/db/supabase';
	import { writeAudit } from '$lib/db/audit';
	import { solveModel, runMutations } from '$lib/api/solve';
	import {
		buildDefaultMutations,
		type Model,
		type SolveResult,
		type Mutation
	} from '$lib/domain';
	import { t } from '$lib/i18n';

	type NodeRow = {
		id: string;
		title: string;
		model: Model;
		result: SolveResult | null;
		parent_id: string | null;
		what_if_generation: number | null;
		deleted_at: string | null;
		mutation: Mutation | null;
		org_id: string | null;
		org_visibility: 'private' | 'org' | null;
		is_favorite: boolean;
		owner_id: string;
	};

	let node = $state<NodeRow | null>(null);
	let children = $state<NodeRow[]>([]);
	let generations = $state<number[]>([]);
	let genIndex = $state(0);
	let error = $state('');
	let busy = $state(false);
	let orgId = $state('');
	let makePublic = $state(false);
	let shareUrl = $state('');
	let grantEmail = $state('');
	let shareMsg = $state('');

	const id = $derived(page.params.id!);

	const activeGen = $derived(generations[genIndex] ?? null);
	const visibleChildren = $derived(
		children.filter((c) => c.what_if_generation === activeGen)
	);

	function purgeDate(deletedAt: string | null): string {
		if (!deletedAt) return '—';
		const d = new Date(deletedAt);
		d.setDate(d.getDate() + 30);
		return d.toLocaleDateString('ru-RU');
	}

	function token() {
		return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
	}

	async function load() {
		const { data: root, error: e1 } = await supabase
			.from('solve_nodes')
			.select('*')
			.eq('id', id)
			.maybeSingle();
		if (e1 || !root) {
			error = e1?.message ?? 'Не найдено';
			return;
		}
		node = root as NodeRow;
		orgId = node.org_id ?? '';
		makePublic = node.org_visibility === 'org';
		const { data: kids } = await supabase
			.from('solve_nodes')
			.select('*')
			.eq('parent_id', id)
			.order('what_if_generation', { ascending: true });
		children = (kids ?? []) as NodeRow[];
		const gens = [...new Set(children.map((c) => c.what_if_generation ?? 0))].sort(
			(a, b) => a - b
		);
		generations = gens;
		genIndex = Math.max(0, gens.length - 1);

		const { data: link } = await supabase
			.from('share_links')
			.select('token')
			.eq('node_id', id)
			.is('revoked_at', null)
			.maybeSingle();
		shareUrl = link ? `${location.origin}/share/${link.token}` : '';
	}

	onMount(() => {
		void load();
	});

	async function doSolve() {
		if (!node) return;
		busy = true;
		error = '';
		try {
			const res = await solveModel(node.model);
			if (res.status !== 'done' || !res.result) {
				error = res.solver_meta.rejected_reason ?? res.status;
				return;
			}
			const { error: upErr } = await supabase
				.from('solve_nodes')
				.update({
					result: res.result,
					solver_meta: res.solver_meta,
					updated_at: new Date().toISOString()
				})
				.eq('id', node.id);
			if (upErr) {
				error = upErr.message;
				return;
			}
			node = { ...node, result: res.result };
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function doWhatIf() {
		if (!node) return;
		busy = true;
		error = '';
		try {
			const mutations = buildDefaultMutations(node.model);
			const pack = await runMutations(node.model, mutations);
			if (pack.status !== 'done') {
				error = pack.solver_meta.rejected_reason ?? pack.status;
				return;
			}
			const nextGen = (generations.at(-1) ?? 0) + 1;
			const now = new Date().toISOString();
			const prev = generations.at(-1);
			if (prev != null) {
				const { error: softErr } = await supabase
					.from('solve_nodes')
					.update({ deleted_at: now })
					.eq('parent_id', node.id)
					.eq('what_if_generation', prev)
					.is('deleted_at', null);
				if (softErr) {
					error = softErr.message;
					return;
				}
			}
			const {
				data: { user }
			} = await supabase.auth.getUser();
			if (!user) {
				error = 'Нет сессии';
				return;
			}
			const rows = pack.items.map((item) => ({
				owner_id: user.id,
				parent_id: node!.id,
				org_id: node!.org_id,
				org_visibility: node!.org_visibility,
				kind: 'sensitivity',
				title: item.mutation.label ?? item.mutation.kind,
				model: item.model,
				mutation: item.mutation,
				result: item.response.result ?? null,
				solver_meta: item.response.solver_meta,
				what_if_generation: nextGen
			}));
			const { error: insErr } = await supabase.from('solve_nodes').insert(rows);
			if (insErr) {
				error = insErr.message;
				return;
			}
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function attachOrg() {
		if (!node || !orgId) return;
		const vis = makePublic ? 'org' : 'private';
		const from = node.org_visibility;
		await supabase
			.from('solve_nodes')
			.update({ org_id: orgId, org_visibility: vis })
			.eq('id', node.id);
		await supabase
			.from('solve_nodes')
			.update({ org_id: orgId, org_visibility: vis })
			.eq('parent_id', node.id)
			.is('deleted_at', null);
		await writeAudit({
			action: 'visibility_change',
			entity_type: 'solve_node',
			entity_id: node.id,
			org_id: orgId,
			visibility_from: from,
			visibility_to: vis
		});
		await load();
	}

	async function setOrgVisibility(vis: 'private' | 'org') {
		if (!node?.org_id) return;
		const from = node.org_visibility;
		await supabase.from('solve_nodes').update({ org_visibility: vis }).eq('id', node.id);
		await supabase
			.from('solve_nodes')
			.update({ org_visibility: vis })
			.eq('parent_id', node.id)
			.is('deleted_at', null);
		await writeAudit({
			action: 'visibility_change',
			entity_type: 'solve_node',
			entity_id: node.id,
			org_id: node.org_id,
			visibility_from: from,
			visibility_to: vis
		});
		await load();
	}

	async function softDelete() {
		if (!node) return;
		const now = new Date().toISOString();
		const { data: links } = await supabase
			.from('share_links')
			.select('id')
			.eq('node_id', node.id)
			.is('revoked_at', null);
		if (links?.length) {
			await supabase
				.from('share_links')
				.update({ revoked_at: now })
				.eq('node_id', node.id)
				.is('revoked_at', null);
			await supabase
				.from('share_grants')
				.update({ revoked_at: now })
				.eq('node_id', node.id)
				.is('revoked_at', null);
			await writeAudit({
				action: 'share_revoke',
				entity_type: 'solve_node',
				entity_id: node.id,
				org_id: node.org_id
			});
		}
		await supabase.from('solve_nodes').update({ deleted_at: now }).eq('id', node.id);
		await writeAudit({
			action: 'soft_delete',
			entity_type: 'solve_node',
			entity_id: node.id,
			org_id: node.org_id
		});
		await goto('/app/trash');
	}

	async function toggleFavorite() {
		if (!node) return;
		await supabase
			.from('solve_nodes')
			.update({ is_favorite: !node.is_favorite })
			.eq('id', node.id);
		await load();
	}

	async function createShareLink() {
		if (!node) return;
		shareMsg = '';
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) return;
		if (node.org_id) {
			shareMsg = 'Внимание: org-сценарий по публичной ссылке.';
		}
		const tok = token();
		const { error: e } = await supabase.from('share_links').insert({
			node_id: node.id,
			token: tok,
			created_by: user.id
		});
		if (e) {
			shareMsg = e.message;
			return;
		}
		await writeAudit({
			action: 'share_create',
			entity_type: 'solve_node',
			entity_id: node.id,
			org_id: node.org_id
		});
		shareUrl = `${location.origin}/share/${tok}`;
	}

	async function revokeShare() {
		if (!node) return;
		const now = new Date().toISOString();
		await supabase
			.from('share_links')
			.update({ revoked_at: now })
			.eq('node_id', node.id)
			.is('revoked_at', null);
		await writeAudit({
			action: 'share_revoke',
			entity_type: 'solve_node',
			entity_id: node.id,
			org_id: node.org_id
		});
		shareUrl = '';
		shareMsg = 'Ссылка отозвана';
	}

	async function grantToEmail() {
		if (!node || !grantEmail) return;
		shareMsg = '';
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) return;
		const granteeId = grantEmail.trim();
		if (
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(granteeId)
		) {
			shareMsg = 'Укажите UUID пользователя (список в /app/admin).';
			return;
		}
		const { error: e } = await supabase.from('share_grants').insert({
			node_id: node.id,
			grantee_id: granteeId,
			created_by: user.id
		});
		if (e) {
			shareMsg = e.message;
			return;
		}
		const { error: nErr } = await supabase.from('notifications').insert({
			user_id: granteeId,
			type: 'share_incoming',
			title: 'Вам расшарили сценарий',
			body: node.title,
			entity_type: 'solve_node',
			entity_id: node.id
		});
		if (nErr) {
			shareMsg = `Grant ok, notify: ${nErr.message}`;
			return;
		}
		await writeAudit({
			action: 'share_grant',
			entity_type: 'solve_node',
			entity_id: node.id,
			target_user_id: granteeId,
			org_id: node.org_id
		});
		shareMsg = 'Доступ выдан, уведомление отправлено';
	}

	async function forkNode() {
		if (!node) return;
		busy = true;
		error = '';
		try {
			const {
				data: { user }
			} = await supabase.auth.getUser();
			if (!user) return;
			const { data: root, error: e1 } = await supabase
				.from('solve_nodes')
				.insert({
					owner_id: user.id,
					title: `${node.title} (fork)`,
					kind: 'root',
					model: node.model,
					result: node.result,
					org_id: null,
					org_visibility: null
				})
				.select('id')
				.single();
			if (e1 || !root) {
				error = e1?.message ?? 'fork failed';
				return;
			}
			const active = generations.at(-1);
			const activeKids = children.filter(
				(c) => c.what_if_generation === active && !c.deleted_at
			);
			if (activeKids.length) {
				await supabase.from('solve_nodes').insert(
					activeKids.map((c) => ({
						owner_id: user.id,
						parent_id: root.id,
						kind: 'sensitivity',
						title: c.title,
						model: c.model,
						mutation: c.mutation,
						result: c.result,
						what_if_generation: 1,
						org_id: null,
						org_visibility: null
					}))
				);
			}
			await writeAudit({
				action: 'fork',
				entity_type: 'solve_node',
				entity_id: root.id
			});
			await goto(`/app/nodes/${root.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

{#if !node}
	<p class="text-text-muted">{error || '…'}</p>
{:else}
	<section class="mx-auto flex max-w-4xl flex-col gap-6">
		<header class="flex flex-wrap items-center justify-between gap-3">
			<h1 class="text-2xl font-medium">{node.title}</h1>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="rounded-[8px] bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
					disabled={busy}
					onclick={doSolve}
				>
					{t('solve')}
				</button>
				<button
					type="button"
					class="rounded-[8px] border border-border px-4 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50"
					disabled={busy}
					onclick={doWhatIf}
				>
					{t('whatIf')}
				</button>
				<button
					type="button"
					class="rounded-[8px] border border-border px-4 py-2 text-sm hover:bg-surface"
					onclick={toggleFavorite}
				>
					{node.is_favorite ? t('unfavorite') : t('favorite')}
				</button>
				<button
					type="button"
					class="rounded-[8px] border border-border px-4 py-2 text-sm hover:bg-surface"
					disabled={busy}
					onclick={forkNode}
				>
					{t('fork')}
				</button>
				<button
					type="button"
					class="rounded-[8px] border border-border px-4 py-2 text-sm text-danger-text hover:bg-danger-bg"
					onclick={softDelete}
				>
					В корзину
				</button>
			</div>
		</header>

		{#if error}<p class="text-danger-text">{error}</p>{/if}

		{#if node.result}
			<div class="rounded-[12px] border border-border p-4">
				<p class="font-mono text-sm">Z = {node.result.Z.toFixed(4)}</p>
				<ul class="mt-2 grid gap-1 font-mono text-sm text-text-muted md:grid-cols-2">
					{#each Object.entries(node.result.x) as [k, v]}
						<li>{k}: {v.toFixed(4)}</li>
					{/each}
				</ul>
				{#if node.result.shadow_prices}
					<p class="mt-3 text-xs font-medium text-text-soft">Теневые цены</p>
					<ul class="mt-1 grid gap-1 font-mono text-sm text-text-muted md:grid-cols-2">
						{#each Object.entries(node.result.shadow_prices) as [k, v]}
							<li>{k}: {v.toFixed(4)}</li>
						{/each}
					</ul>
				{/if}
				<p class="mt-3 text-sm text-text-soft">
					Критичные: {node.result.critical_resources.join(', ') || '—'}
				</p>
			</div>
		{/if}

		<div class="rounded-[12px] border border-border p-4">
			<h2 class="mb-3 text-lg font-medium">{t('whatIf')}</h2>
			{#if generations.length}
				<div class="mb-2 flex items-center gap-3">
					<button
						type="button"
						class="rounded-[6px] border border-border px-2 py-1 disabled:opacity-40"
						disabled={genIndex <= 0}
						onclick={() => (genIndex -= 1)}
					>
						←
					</button>
					<span class="font-mono text-sm">{genIndex + 1}/{generations.length}</span>
					<button
						type="button"
						class="rounded-[6px] border border-border px-2 py-1 disabled:opacity-40"
						disabled={genIndex >= generations.length - 1}
						onclick={() => (genIndex += 1)}
					>
						→
					</button>
				</div>
				<p class="mb-3 text-xs text-text-soft">
					{#if genIndex === generations.length - 1}
						{t('generationActiveHint')}
					{:else}
						{t('generationPurge', {
							date: purgeDate(
								children.find((c) => c.what_if_generation === activeGen)?.deleted_at ?? null
							)
						})}
					{/if}
				</p>
				<div class="overflow-x-auto">
					<table class="w-full text-left text-sm">
						<thead>
							<tr class="border-b border-border text-text-muted">
								<th class="py-2 pr-3">Мутация</th>
								<th class="py-2">Z</th>
							</tr>
						</thead>
						<tbody>
							{#each visibleChildren as c}
								<tr class="border-b border-border-soft">
									<td class="py-2 pr-3">{c.title}</td>
									<td class="font-mono">{c.result?.Z?.toFixed(3) ?? '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="text-sm text-text-muted">Запустите анализ чувствительности.</p>
			{/if}
		</div>

		<div class="rounded-[12px] border border-border p-4">
			<h2 class="mb-3 text-lg font-medium">{t('attachOrg')}</h2>
			<input
				class="mb-2 w-full rounded-[8px] border border-border px-3 py-2 text-sm"
				placeholder="org uuid"
				bind:value={orgId}
			/>
			<label class="mb-3 flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={makePublic} />
				{t('makePublicInOrg')}
			</label>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="rounded-[8px] border border-border px-4 py-2 text-sm hover:bg-surface"
					onclick={attachOrg}
				>
					{t('attachOrg')}
				</button>
				{#if node.org_id}
					<button
						type="button"
						class="rounded-[8px] border border-border px-4 py-2 text-sm hover:bg-surface"
						onclick={() => setOrgVisibility('private')}
					>
						{t('hideInOrg')}
					</button>
					<button
						type="button"
						class="rounded-[8px] border border-border px-4 py-2 text-sm hover:bg-surface"
						onclick={() => setOrgVisibility('org')}
					>
						{t('showInOrg')}
					</button>
				{/if}
			</div>
		</div>

		<div class="rounded-[12px] border border-border p-4">
			<h2 class="mb-3 text-lg font-medium">{t('share')}</h2>
			{#if shareUrl}
				<p class="mb-2 break-all font-mono text-xs">{shareUrl}</p>
				<button
					type="button"
					class="rounded-[8px] border border-border px-4 py-2 text-sm"
					onclick={revokeShare}>Отозвать ссылку</button
				>
			{:else}
				<button
					type="button"
					class="rounded-[8px] border border-border px-4 py-2 text-sm hover:bg-surface"
					onclick={createShareLink}>Создать ссылку</button
				>
			{/if}
			<div class="mt-4 flex flex-wrap gap-2">
				<input
					class="min-w-[12rem] flex-1 rounded-[8px] border border-border px-3 py-2 text-sm"
					placeholder="UUID получателя"
					bind:value={grantEmail}
				/>
				<button
					type="button"
					class="rounded-[8px] border border-border px-4 py-2 text-sm hover:bg-surface"
					onclick={grantToEmail}>Выдать доступ</button
				>
			</div>
			{#if shareMsg}<p class="mt-2 text-sm text-text-muted">{shareMsg}</p>{/if}
		</div>
	</section>
{/if}
