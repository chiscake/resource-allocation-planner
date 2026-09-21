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
		type Mutation,
		type WhatIfDefaults
	} from '$lib/domain';
	import { t } from '$lib/i18n';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';

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

	type OrgOption = { id: string; name: string };
	type OrgJoin = { id: string; name: string } | { id: string; name: string }[] | null;

	function pickOrg(raw: OrgJoin): OrgOption | null {
		if (!raw) return null;
		const org = Array.isArray(raw) ? raw[0] : raw;
		return org ? { id: org.id, name: org.name } : null;
	}

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
	let userOrgs = $state<OrgOption[]>([]);
	let activeTab = $state('plan');
	let editModel = $state<Model | null>(null);
	let hasActiveShare = $state(false);

	const id = $derived(page.params.id!);
	const modelEditable = $derived(node != null && !node.result);
	const activeGen = $derived(generations[genIndex] ?? null);
	const visibleChildren = $derived(
		children.filter((c) => c.what_if_generation === activeGen)
	);
	const orgSelectOptions = $derived(userOrgs.map((o) => ({ value: o.id, label: o.name })));
	const tabItems = $derived([
		{ id: 'plan', label: t('tabPlan') },
		{ id: 'sensitivity', label: t('tabSensitivity') },
		{ id: 'ga', label: t('tabGa') },
		{ id: '4d', label: t('tab4d') }
	]);

	function purgeDate(deletedAt: string | null): string {
		if (!deletedAt) return '—';
		const d = new Date(deletedAt);
		d.setDate(d.getDate() + 30);
		return d.toLocaleDateString('ru-RU');
	}

	function token() {
		return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
	}

	function syncEditModel() {
		if (node) editModel = structuredClone(node.model);
	}

	function pctToInput(v: number | undefined, fallback: number): string {
		return String(Math.round((v ?? fallback) * 100));
	}

	function inputToPct(s: string, fallback: number): number {
		const n = parseFloat(s);
		return Number.isFinite(n) ? n / 100 : fallback;
	}

	function ensureWhatIfDefaults(m: Model): WhatIfDefaults {
		return {
			resource_pct: m.what_if_defaults?.resource_pct ?? 0.1,
			modernization_pct: m.what_if_defaults?.modernization_pct ?? 0.1,
			price_pct: m.what_if_defaults?.price_pct ?? 0.15
		};
	}

	async function loadUserOrgs() {
		const { data: auth } = await supabase.auth.getUser();
		if (!auth.user) {
			userOrgs = [];
			return;
		}
		const { data } = await supabase
			.from('organization_members')
			.select('org_id, organizations(id, name)')
			.eq('user_id', auth.user.id);
		userOrgs = (data ?? [])
			.map((row) => pickOrg(row.organizations as OrgJoin))
			.filter((o): o is OrgOption => o != null);
	}

	async function load() {
		const { data: root, error: e1 } = await supabase
			.from('solve_nodes')
			.select('*')
			.eq('id', id)
			.maybeSingle();
		if (e1 || !root) {
			error = e1?.message ?? t('notFound');
			return;
		}
		node = root as NodeRow;
		syncEditModel();
		orgId = node.org_id ?? userOrgs[0]?.id ?? '';
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

		const { data: links } = await supabase
			.from('share_links')
			.select('token')
			.eq('node_id', id)
			.is('revoked_at', null);
		const { data: grants } = await supabase
			.from('share_grants')
			.select('id')
			.eq('node_id', id)
			.is('revoked_at', null);
		hasActiveShare = Boolean(links?.length || grants?.length);
		shareUrl = links?.[0] ? `${location.origin}/share/${links[0].token}` : '';
	}

	onMount(() => {
		void loadUserOrgs().then(() => load());
	});

	async function persistModel(model: Model) {
		if (!node) return false;
		const { error: upErr } = await supabase
			.from('solve_nodes')
			.update({ model, updated_at: new Date().toISOString() })
			.eq('id', node.id);
		if (upErr) {
			error = upErr.message;
			return false;
		}
		node = { ...node, model };
		return true;
	}

	async function doSolve() {
		if (!node || !editModel) return;
		busy = true;
		error = '';
		try {
			if (modelEditable) {
				const ok = await persistModel(editModel);
				if (!ok) return;
			}
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
			if (modelEditable && editModel) {
				const ok = await persistModel(editModel);
				if (!ok) return;
			}
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
				error = t('noSession');
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

	async function revokeAllShares() {
		if (!node) return;
		const now = new Date().toISOString();
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
		shareUrl = '';
		hasActiveShare = false;
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
			await revokeAllShares();
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
			shareMsg = t('shareOrgWarning');
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
		hasActiveShare = true;
	}

	async function revokeShare() {
		if (!node) return;
		await revokeAllShares();
		shareMsg = t('shareRevoked');
	}

	async function cancelSharing() {
		if (!node) return;
		busy = true;
		shareMsg = '';
		error = '';
		try {
			if (node.org_id) {
				await revokeAllShares();
				shareMsg = t('shareRevoked');
				return;
			}
			const {
				data: { user }
			} = await supabase.auth.getUser();
			if (!user) {
				error = t('noSession');
				return;
			}
			const { data: root, error: e1 } = await supabase
				.from('solve_nodes')
				.insert({
					owner_id: user.id,
					title: node.title,
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
			await revokeAllShares();
			const now = new Date().toISOString();
			await supabase.from('solve_nodes').update({ deleted_at: now }).eq('id', node.id);
			await writeAudit({
				action: 'soft_delete',
				entity_type: 'solve_node',
				entity_id: node.id,
				org_id: node.org_id
			});
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
			shareMsg = t('grantHint');
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
		hasActiveShare = true;
		shareMsg = t('shareGranted');
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

	function updateB(index: number, raw: string) {
		if (!editModel) return;
		const v = parseFloat(raw);
		if (!Number.isFinite(v)) return;
		const next = structuredClone(editModel);
		next.b[index] = v;
		editModel = next;
	}

	function updateC(index: number, raw: string) {
		if (!editModel) return;
		const v = parseFloat(raw);
		if (!Number.isFinite(v)) return;
		const next = structuredClone(editModel);
		next.c[index] = v;
		editModel = next;
	}

	function updateWhatIf(field: keyof WhatIfDefaults, raw: string) {
		if (!editModel) return;
		const defaults = ensureWhatIfDefaults(editModel);
		const next = structuredClone(editModel);
		next.what_if_defaults = {
			...defaults,
			[field]: inputToPct(raw, defaults[field] ?? 0.1)
		};
		editModel = next;
	}
</script>

{#if !node}
	<p class="text-text-muted">{error || '…'}</p>
{:else}
	<section class="mx-auto flex max-w-4xl flex-col gap-6">
		<PageHeader title={node.title}>
			{#snippet actions()}
				<Button variant="secondary" disabled={busy} onclick={toggleFavorite}>
					{node!.is_favorite ? t('unfavorite') : t('favorite')}
				</Button>
				<Button variant="secondary" disabled={busy} onclick={forkNode}>{t('fork')}</Button>
				<Button variant="danger" onclick={softDelete}>{t('trashToBin')}</Button>
			{/snippet}
		</PageHeader>

		{#if error}<p class="text-danger-text">{error}</p>{/if}

		<Tabs items={tabItems} bind:active={activeTab} />

		{#if activeTab === 'plan'}
			<div class="flex flex-col gap-4">
				{#if editModel}
					<Card>
						<h2 class="mb-4 text-lg font-medium">{t('tabPlan')}</h2>
						{#if !modelEditable}
							<p class="mb-4 text-sm text-text-muted">{t('modelReadOnlyHint')}</p>
						{/if}

						<div class="mb-4">
							<p class="mb-2 text-sm font-medium">{t('modelLimits')}</p>
							<div class="grid gap-2 sm:grid-cols-2">
								{#each editModel.resources as resource, i}
									<label class="flex items-center gap-2 text-sm">
										<span class="min-w-[6rem] text-text-muted">{resource}</span>
										<Input
											type="number"
											step="any"
											value={String(editModel.b[i])}
											disabled={!modelEditable}
											oninput={(e) => updateB(i, e.currentTarget.value)}
										/>
									</label>
								{/each}
							</div>
						</div>

						<div class="mb-4">
							<p class="mb-2 text-sm font-medium">{t('modelPrices')}</p>
							<div class="grid gap-2 sm:grid-cols-2">
								{#each editModel.products as product, j}
									<label class="flex items-center gap-2 text-sm">
										<span class="min-w-[6rem] text-text-muted">{product}</span>
										<Input
											type="number"
											step="any"
											value={String(editModel.c[j])}
											disabled={!modelEditable}
											oninput={(e) => updateC(j, e.currentTarget.value)}
										/>
									</label>
								{/each}
							</div>
						</div>

						<div class="mb-4">
							<p class="mb-2 text-sm font-medium">{t('whatIfDefaults')}</p>
							<div class="grid gap-2 sm:grid-cols-3">
								<label class="text-sm">
									<span class="mb-1 block text-text-muted">{t('whatIfResourcePct')}</span>
									<Input
										type="number"
										step="1"
										min="0"
										value={pctToInput(
											editModel.what_if_defaults?.resource_pct,
											0.1
										)}
										disabled={!modelEditable}
										oninput={(e) => updateWhatIf('resource_pct', e.currentTarget.value)}
									/>
								</label>
								<label class="text-sm">
									<span class="mb-1 block text-text-muted">{t('whatIfModernizationPct')}</span>
									<Input
										type="number"
										step="1"
										min="0"
										value={pctToInput(
											editModel.what_if_defaults?.modernization_pct,
											0.1
										)}
										disabled={!modelEditable}
										oninput={(e) =>
											updateWhatIf('modernization_pct', e.currentTarget.value)}
									/>
								</label>
								<label class="text-sm">
									<span class="mb-1 block text-text-muted">{t('whatIfPricePct')}</span>
									<Input
										type="number"
										step="1"
										min="0"
										value={pctToInput(editModel.what_if_defaults?.price_pct, 0.15)}
										disabled={!modelEditable}
										oninput={(e) => updateWhatIf('price_pct', e.currentTarget.value)}
									/>
								</label>
							</div>
						</div>

						<Button disabled={busy} onclick={doSolve}>{t('solve')}</Button>
					</Card>
				{/if}

				{#if node.result}
					<Card>
						<p class="font-mono text-sm">Z = {node.result.Z.toFixed(4)}</p>
						<p class="mt-3 text-xs font-medium text-text-soft">x</p>
						<ul class="mt-1 grid gap-1 font-mono text-sm text-text-muted md:grid-cols-2">
							{#each Object.entries(node.result.x) as [k, v]}
								<li>{k}: {v.toFixed(4)}</li>
							{/each}
						</ul>
						{#if node.result.shadow_prices}
							<p class="mt-3 text-xs font-medium text-text-soft">{t('shadowPrices')}</p>
							<ul class="mt-1 grid gap-1 font-mono text-sm text-text-muted md:grid-cols-2">
								{#each Object.entries(node.result.shadow_prices) as [k, v]}
									<li>{k}: {v.toFixed(4)}</li>
								{/each}
							</ul>
						{/if}
						{#if node.result.resource_slack}
							<p class="mt-3 text-xs font-medium text-text-soft">{t('resourceSlack')}</p>
							<ul class="mt-1 grid gap-1 font-mono text-sm text-text-muted md:grid-cols-2">
								{#each Object.entries(node.result.resource_slack) as [k, v]}
									<li>{k}: {v.toFixed(4)}</li>
								{/each}
							</ul>
						{/if}
						<p class="mt-3 text-sm text-text-soft">
							{t('criticalResources')}: {node.result.critical_resources.join(', ') || '—'}
						</p>
					</Card>
				{/if}
			</div>
		{:else if activeTab === 'sensitivity'}
			<Card>
				<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
					<h2 class="text-lg font-medium">{t('whatIf')}</h2>
					<Button variant="secondary" disabled={busy} onclick={doWhatIf}>{t('whatIf')}</Button>
				</div>
				{#if generations.length}
					<div class="mb-2 flex items-center gap-3">
						<Button
							variant="ghost"
							class="!px-2 !py-1"
							disabled={genIndex <= 0}
							onclick={() => (genIndex -= 1)}>←</Button
						>
						<span class="font-mono text-sm">{genIndex + 1}/{generations.length}</span>
						<Button
							variant="ghost"
							class="!px-2 !py-1"
							disabled={genIndex >= generations.length - 1}
							onclick={() => (genIndex += 1)}>→</Button
						>
					</div>
					<p class="mb-3 text-xs text-text-soft">
						{#if genIndex === generations.length - 1}
							{t('generationActiveHint')}
						{:else}
							{t('generationPurge', {
								date: purgeDate(
									children.find((c) => c.what_if_generation === activeGen)?.deleted_at ??
										null
								)
							})}
						{/if}
					</p>
					<div class="overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead>
								<tr class="border-b border-border text-text-muted">
									<th class="py-2 pr-3">{t('mutation')}</th>
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
					<p class="text-sm text-text-muted">{t('runWhatIfHint')}</p>
				{/if}
			</Card>
		{:else if activeTab === 'ga' || activeTab === '4d'}
			<Card>
				<p class="text-center text-text-muted">{t('inDevelopment')}</p>
			</Card>
		{/if}

		<Card>
			<h2 class="mb-3 text-lg font-medium">{t('attachOrg')}</h2>
			{#if userOrgs.length === 0}
				<p class="mb-3 text-sm text-text-muted">Нет организаций (запустите pnpm seed:users)</p>
			{:else}
				<Select
					class="mb-3"
					bind:value={orgId}
					options={orgSelectOptions}
					placeholder={t('selectOrg')}
				/>
			{/if}
			<label class="mb-3 flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={makePublic} />
				{t('makePublicInOrg')}
			</label>
			<div class="flex flex-wrap gap-2">
				<Button variant="secondary" disabled={!orgId} onclick={attachOrg}>{t('attachOrg')}</Button>
				{#if node.org_id}
					<Button variant="secondary" onclick={() => setOrgVisibility('private')}>
						{t('hideInOrg')}
					</Button>
					<Button variant="secondary" onclick={() => setOrgVisibility('org')}>
						{t('showInOrg')}
					</Button>
				{/if}
			</div>
		</Card>

		<Card>
			<h2 class="mb-3 text-lg font-medium">{t('share')}</h2>
			{#if node.org_id}
				<p class="mb-3 rounded-[8px] bg-warning-bg px-3 py-2 text-sm text-warning-text">
					{t('shareOrgWarning')}
				</p>
			{/if}
			{#if shareUrl}
				<p class="mb-2 break-all font-mono text-xs">{shareUrl}</p>
				<Button variant="secondary" onclick={revokeShare}>{t('revokeShareLink')}</Button>
			{:else}
				<Button variant="secondary" onclick={createShareLink}>{t('createShareLink')}</Button>
			{/if}
			{#if hasActiveShare}
				<div class="mt-2">
					<Button variant="secondary" disabled={busy} onclick={cancelSharing}>
						{t('cancelSharing')}
					</Button>
				</div>
			{/if}
			<div class="mt-4 flex flex-wrap gap-2">
				<Input class="min-w-[12rem] flex-1" placeholder={t('grantPlaceholder')} bind:value={grantEmail} />
				<Button variant="secondary" onclick={grantToEmail}>{t('grantAccess')}</Button>
			</div>
			{#if shareMsg}<p class="mt-2 text-sm text-text-muted">{shareMsg}</p>{/if}
		</Card>
	</section>
{/if}
