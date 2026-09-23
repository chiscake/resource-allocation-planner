<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate, goto } from '$app/navigation';
	import { supabase } from '$lib/db/supabase';
	import { writeAudit } from '$lib/db/audit';
	import { softDeleteSolveNode } from '$lib/db/soft-delete';
	import { solveModel, runMutations } from '$lib/api/solve';
	import {
		buildDefaultMutations,
		cloneModel,
		isSolveMethod,
		type Model,
		type SolveResult,
		type SolverMeta,
		type Mutation,
		type WhatIfDefaults
	} from '$lib/domain';
	import { maybeRoundPlan } from '$lib/display';
	import { t } from '$lib/i18n';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import SolveWorkspace from '$lib/components/model/SolveWorkspace.svelte';
	import NodeComments from '$lib/components/NodeComments.svelte';
	import OrgAttachPanel from '$lib/components/OrgAttachPanel.svelte';
	import SharePanel from '$lib/components/SharePanel.svelte';
	import InlineAlert from '$lib/components/ui/InlineAlert.svelte';
	import {
		createSolveSession,
		solveMethodToTab,
		type WhatIfRow
	} from '$lib/components/model/solve-session.svelte';
	import { Star, GitFork, Trash2 } from '@lucide/svelte';

	type NodeRow = {
		id: string;
		title: string;
		kind: string;
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
		solver_meta?: SolverMeta | null;
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
	let orgId = $state('');
	let makePublic = $state(false);
	let shareUrl = $state('');
	let grantEmail = $state('');
	let shareMsg = $state('');
	let userOrgs = $state<OrgOption[]>([]);
	let hasActiveShare = $state(false);
	const session = createSolveSession();

	const id = $derived(page.params.id!);
	const solverLibrary = $derived(
		typeof node?.solver_meta?.library === 'string' ? node.solver_meta.library : null
	);
	/** What-if kids only — revisions also use parent_id with kind='revision'. */
	const whatIfChildren = $derived(
		children.filter((c) => c.kind === 'sensitivity' || c.what_if_generation != null)
	);
	const activeGen = $derived(generations[genIndex] ?? null);
	const visibleChildren = $derived(
		whatIfChildren.filter((c) => c.what_if_generation === activeGen)
	);
	const whatIfRows = $derived<WhatIfRow[]>(
		visibleChildren.map((c) => ({
			title: c.title,
			Z: c.result
				? session.roundPlan
					? maybeRoundPlan(c.model, c.result, true).Z
					: c.result.Z
				: Number.NaN
		}))
	);
	const whatIfArchiveHint = $derived(
		t('generationPurge', {
			date: purgeDate(
				children.find((c) => c.what_if_generation === activeGen)?.deleted_at ?? null
			)
		})
	);
	const orgSelectOptions = $derived(userOrgs.map((o) => ({ value: o.id, label: o.name })));

	function purgeDate(deletedAt: string | null): string {
		if (!deletedAt) return '—';
		const d = new Date(deletedAt);
		d.setDate(d.getDate() + 30);
		return d.toLocaleDateString('ru-RU');
	}

	function token() {
		return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
	}

	function syncSessionFromNode() {
		if (!node?.model) {
			session.model = null;
			session.result = null;
			return;
		}
		const loadedMethod = node.solver_meta?.method;
		session.hydrate({
			model: $state.snapshot(node.model),
			result: node.result,
			activeTab: isSolveMethod(loadedMethod) ? solveMethodToTab(loadedMethod) : session.activeTab,
			whatIfItems: []
		});
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
		syncSessionFromNode();
		orgId = node.org_id ?? userOrgs[0]?.id ?? '';
		makePublic = node.org_visibility === 'org';
		const { data: kids } = await supabase
			.from('solve_nodes')
			.select('*')
			.eq('parent_id', id)
			.order('what_if_generation', { ascending: true });
		children = (kids ?? []) as NodeRow[];
		const sensitivity = children.filter(
			(c) => c.kind === 'sensitivity' || c.what_if_generation != null
		);
		const gens = [
			...new Set(sensitivity.map((c) => c.what_if_generation).filter((g): g is number => g != null))
		].sort((a, b) => a - b);
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

	afterNavigate(() => {
		session.loadRoundPref();
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
			session.error = upErr.message;
			return false;
		}
		node = { ...node, model };
		session.replaceModel(model, { clearDerived: false });
		return true;
	}

	/** Soft-delete active sensitivity kids when parent model/result is replaced. */
	async function softDeleteActiveSensitivity(): Promise<boolean> {
		if (!node) return false;
		const now = new Date().toISOString();
		const { error: softErr } = await supabase
			.from('solve_nodes')
			.update({ deleted_at: now })
			.eq('parent_id', node.id)
			.eq('kind', 'sensitivity')
			.is('deleted_at', null);
		if (softErr) {
			error = softErr.message;
			return false;
		}
		return true;
	}

	/** Persist what-if kids for current node.model (caller holds busy/error). */
	async function runWhatIfPack(): Promise<boolean> {
		if (!node) return false;
		const mutations = buildDefaultMutations(node.model);
		if (mutations.length === 0) {
			// All what-if fields empty/disabled — archive stale kids, no insert.
			return softDeleteActiveSensitivity();
		}
		const pack = await runMutations(node.model, mutations, session.solveMethod);
		if (pack.status !== 'done') {
			error = pack.solver_meta.rejected_reason ?? pack.status;
			return false;
		}
		const nextGen = (generations.at(-1) ?? 0) + 1;
		if (!(await softDeleteActiveSensitivity())) return false;
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) {
			error = t('noSession');
			return false;
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
			return false;
		}
		return true;
	}

	async function doSolve() {
		if (!node || !session.model || !session.methodReady) return;
		session.busy = true;
		session.error = '';
		error = '';
		try {
			const toSolve = $state.snapshot(session.model);
			const ok = await persistModel(toSolve);
			if (!ok) return;

			const res = await solveModel(toSolve, session.solveMethod);
			if (res.status !== 'done' || !res.result) {
				const msg = res.solver_meta.rejected_reason ?? res.status;
				error = msg;
				session.error = msg;
				return;
			}
			const { error: upErr } = await supabase
				.from('solve_nodes')
				.update({
					model: toSolve,
					result: res.result,
					solver_meta: res.solver_meta,
					updated_at: new Date().toISOString()
				})
				.eq('id', node.id);
			if (upErr) {
				error = upErr.message;
				session.error = upErr.message;
				return;
			}
			node = {
				...node,
				model: toSolve,
				result: res.result,
				solver_meta: res.solver_meta
			};
			session.hydrate({
				model: toSolve,
				result: res.result,
				activeTab: session.activeTab,
				includeSensitivity: session.includeSensitivity
			});

			if (session.includeSensitivity) {
				const wiOk = await runWhatIfPack();
				if (!wiOk) return;
				await load();
			} else if (whatIfChildren.some((c) => !c.deleted_at)) {
				// Model/result changed — archive stale sensitivity kids.
				if (!(await softDeleteActiveSensitivity())) return;
				await load();
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			error = msg;
			session.error = msg;
		} finally {
			session.busy = false;
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
		await softDeleteSolveNode({ id: node.id, org_id: node.org_id });
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
		session.busy = true;
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
			const activeKids = whatIfChildren.filter(
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
			await goto(`/app/task/${root.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			session.busy = false;
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
		session.busy = true;
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
			const activeKids = whatIfChildren.filter(
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
			await goto(`/app/task/${root.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			session.busy = false;
		}
	}

	function updateWhatIf(field: keyof WhatIfDefaults, raw: string) {
		session.updateWhatIf(field, raw);
	}

	function onModelChange(next: Model) {
		session.replaceModel(next);
	}

	/** Rename allowed even after solve (title-only update). */
	async function renameNode(nextTitle: string) {
		if (!node) return;
		const title = nextTitle.trim();
		if (!title || title === node.title) return;
		const { error: upErr } = await supabase
			.from('solve_nodes')
			.update({ title, updated_at: new Date().toISOString() })
			.eq('id', node.id);
		if (upErr) {
			error = upErr.message || t('titleSaveFailed');
			return;
		}
		node = { ...node, title };
	}
</script>

{#if !node}
	<p class="text-text-muted">{error || '…'}</p>
{:else}
	<section class="mx-auto flex w-full max-w-6xl flex-col gap-6">
		<PageHeader title={node.title} editable ontitlecommit={renameNode}>
			{#snippet actions()}
				{@const favoriteLabel = node!.is_favorite ? t('unfavorite') : t('favorite')}
				<Button
					variant="secondary"
					class="!px-2.5 !py-2.5"
					disabled={session.busy}
					aria-label={favoriteLabel}
					title={favoriteLabel}
					onclick={toggleFavorite}
				>
					<Star
						size={18}
						strokeWidth={1.75}
						aria-hidden="true"
						class={node!.is_favorite ? 'text-amber-400' : 'text-text-soft'}
						fill={node!.is_favorite ? 'currentColor' : 'none'}
					/>
				</Button>
				<Button
					variant="secondary"
					class="!px-2.5 !py-2.5"
					disabled={session.busy}
					aria-label={t('fork')}
					title={t('fork')}
					onclick={forkNode}
				>
					<GitFork size={18} strokeWidth={1.75} aria-hidden="true" />
				</Button>
				<Button
					variant="danger"
					class="!px-2.5 !py-2.5"
					disabled={session.busy}
					aria-label={t('trashToBin')}
					title={t('trashToBin')}
					onclick={softDelete}
				>
					<Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
				</Button>
			{/snippet}
		</PageHeader>

		{#if error}
			<InlineAlert>{error}</InlineAlert>
		{/if}

		{#if session.model}
			<SolveWorkspace
				{session}
				{solverLibrary}
				whatIfRows={whatIfRows}
				whatIfGenerationIndex={genIndex}
				whatIfGenerationCount={generations.length || 1}
				onWhatIfGenerationChange={(i) => (genIndex = i)}
				whatIfArchiveHint={whatIfArchiveHint}
				onModelChange={onModelChange}
				onWhatIfChange={updateWhatIf}
				onSolve={doSolve}
			>
				{#snippet planExtras()}
					<NodeComments nodeId={node!.id} scope="plan" />
				{/snippet}
				{#snippet resultExtras()}
					<NodeComments nodeId={node!.id} scope="result" />
				{/snippet}
			</SolveWorkspace>
		{:else}
			<Card>
				<p class="text-sm text-text-muted">{t('modelMatrix')}</p>
				<p class="mt-2 text-sm text-danger-text">{t('notFound')}</p>
			</Card>
		{/if}

		<OrgAttachPanel
			bind:orgId
			bind:makePublic
			orgOptions={orgSelectOptions}
			attachedOrgId={node.org_id}
			onAttach={attachOrg}
			onSetVisibility={setOrgVisibility}
		/>

		<SharePanel
			{shareUrl}
			{hasActiveShare}
			busy={session.busy}
			bind:grantValue={grantEmail}
			message={shareMsg}
			showOrgWarning={Boolean(node.org_id)}
			onCreateLink={createShareLink}
			onRevokeLink={revokeShare}
			onCancelSharing={cancelSharing}
			onGrant={grantToEmail}
		/>
	</section>
{/if}
